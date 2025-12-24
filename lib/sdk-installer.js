const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const https = require('https');
const AdmZip = require('adm-zip');

const execAsync = promisify(exec);

class SdkInstaller {
    constructor() {
        this.sdkRoot = null;
        this.cmdlineToolsPath = null;
        this.avdName = 'IrctcBotAVD';
        this.systemImage = 'system-images;android-30;google_apis_playstore;x86_64'; // Android 11 with Play Store (Non-Rooted usually)
        this.avdRoot = null;
    }

    init(userDataPath) {
        this.sdkRoot = path.join(userDataPath, 'android-sdk');
        this.avdRoot = path.join(userDataPath, 'android-avd'); // Private AVD home
        // cmdline-tools structure: cmdline-tools/latest/bin
        this.cmdlineToolsPath = path.join(this.sdkRoot, 'cmdline-tools', 'latest', 'bin');
    }

    getSdkRoot() {
        return this.sdkRoot;
    }

    getAvdRoot() {
        return this.avdRoot;
    }

    getAvdName() {
        return this.avdName;
    }

    async checkEnvironment() {
        if (!this.sdkRoot) throw new Error('SdkInstaller not initialized. Call init() first.');

        const emulatorBinary = os.platform() === 'win32' ? 'emulator.exe' : 'emulator';
        const emulatorPath = path.join(this.sdkRoot, 'emulator', emulatorBinary);
        // With custom ANDROID_AVD_HOME, AVD ini files will be in avdRoot
        // avdmanager creates [name].ini in root of AVD_HOME and [name].avd folder
        const avdIniPath = path.join(this.avdRoot, `${this.avdName}.ini`);

        const hasSdk = fs.existsSync(this.cmdlineToolsPath);
        const hasEmulator = fs.existsSync(emulatorPath);
        // Strict check: does our specific ini exist in our private folder?
        const hasAvd = fs.existsSync(avdIniPath);

        return {
            valid: hasSdk && hasEmulator && hasAvd,
            hasSdk,
            hasEmulator,
            hasAvd
        };
    }

    getJavaBinPath() {
        const javaDir = path.join(path.dirname(this.sdkRoot), 'java');
        const javaHome = path.join(javaDir, 'local-jdk');
        return path.join(javaHome, 'bin');
    }

    getEnv() {
        const env = { ...process.env };

        // Local Java
        const javaDir = path.join(path.dirname(this.sdkRoot), 'java');
        const javaHome = path.join(javaDir, 'local-jdk');
        const javaBin = path.join(javaHome, 'bin');

        // Helper to find case-insensitive Path key
        const pathKey = Object.keys(env).find(k => k.match(/^path$/i)) || 'Path';

        if (fs.existsSync(javaBin)) {
            env.JAVA_HOME = javaHome;
            // Append to existing Path instead of creating potential duplicate/undefined
            env[pathKey] = `${javaBin}${path.delimiter}${env[pathKey] || ''}`;
        }

        env.ANDROID_HOME = this.sdkRoot;
        env.ANDROID_SDK_ROOT = this.sdkRoot;
        env.ANDROID_AVD_HOME = this.avdRoot;

        return env;
    }

    async downloadFile(url, destPath, onProgress) {
        // Ensure dir exists
        const dirname = path.dirname(destPath);
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            const download = (downloadUrl) => {
                const request = https.get(downloadUrl, (response) => {
                    // Handle Redirects
                    if (response.statusCode === 301 || response.statusCode === 302) {
                        if (response.headers.location) {
                            return download(response.headers.location);
                        } else {
                            return reject(new Error('Redirect with no location'));
                        }
                    }

                    if (response.statusCode !== 200) {
                        try { fs.unlinkSync(destPath); } catch (e) { }
                        return reject(new Error(`Failed to download: ${response.statusCode}`));
                    }

                    const file = fs.createWriteStream(destPath);
                    const totalSize = parseInt(response.headers['content-length'], 10);
                    let downloaded = 0;

                    response.on('data', (chunk) => {
                        downloaded += chunk.length;
                        file.write(chunk);
                        if (onProgress && totalSize) {
                            onProgress(downloaded, totalSize);
                        }
                    });

                    response.on('end', () => {
                        file.end();
                    });

                    file.on('finish', () => {
                        file.close(() => resolve());
                    });

                    file.on('error', (err) => {
                        try { fs.unlinkSync(destPath); } catch (e) { }
                        reject(err);
                    });
                });

                request.on('error', (err) => {
                    try { fs.unlinkSync(destPath); } catch (e) { }
                    reject(err);
                });
            };

            download(url);
        });
    }

    async installJava(onProgress) {
        if (!this.sdkRoot) throw new Error('Init first');

        const javaDir = path.join(path.dirname(this.sdkRoot), 'java');
        const javaLocalName = 'local-jdk';
        const javaLocalPath = path.join(javaDir, javaLocalName);
        const javaBin = path.join(javaLocalPath, 'bin');

        // Check if already installed
        if (fs.existsSync(javaBin) && fs.existsSync(path.join(javaBin, 'java.exe'))) {
            return true;
        }

        if (fs.existsSync(javaDir)) {
            fs.rmSync(javaDir, { recursive: true, force: true });
        }
        fs.mkdirSync(javaDir, { recursive: true });

        // Download OpenJDK 17 (Temurin) - Required for latest Android cmdline-tools
        const url = 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_windows_hotspot_17.0.13_11.zip';

        const zipPath = path.join(javaDir, 'openjdk.zip');

        console.log('[SdkInstaller] Downloading Java 17 from', url);
        await this.downloadFile(url, zipPath, onProgress);

        console.log('[SdkInstaller] Extracting Java...');
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(javaDir, true);

        fs.unlinkSync(zipPath);

        // Rename extracted folder to standard name
        const children = fs.readdirSync(javaDir);
        const extractedFolder = children.find(c => fs.statSync(path.join(javaDir, c)).isDirectory());
        if (extractedFolder) {
            try {
                fs.renameSync(path.join(javaDir, extractedFolder), javaLocalPath);
            } catch (e) {
                // If rename fails (locking?), wait and retry or throw
                // But typically okay for fresh extract
                throw new Error(`Failed to rename Java folder: ${e.message}`);
            }
        } else {
            throw new Error('Could not find extracted JDK folder');
        }

        return true;
    }

    async downloadCmdlineTools(onProgress) {
        if (!this.sdkRoot) throw new Error('Init first');

        // Create SDK dir
        if (!fs.existsSync(this.sdkRoot)) {
            fs.mkdirSync(this.sdkRoot, { recursive: true });
        }

        // Determine URL based on OS
        const platform = os.platform();
        let url = '';
        // Links from developer.android.com/studio#command-tools (Latest known stable)
        if (platform === 'linux') url = 'https://dl.google.com/android/repository/commandlinetools-linux-10406996_latest.zip';
        else if (platform === 'win32') url = 'https://dl.google.com/android/repository/commandlinetools-win-10406996_latest.zip';
        else if (platform === 'darwin') url = 'https://dl.google.com/android/repository/commandlinetools-mac-10406996_latest.zip';
        else throw new Error(`Unsupported platform: ${platform}`);

        const zipPath = path.join(this.sdkRoot, 'cmdline-tools.zip');

        // Check if file exists and delete it to ensure fresh download
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }

        console.log('[SdkInstaller] Downloading tools from', url);
        await this.downloadFile(url, zipPath, onProgress);

        console.log('[SdkInstaller] Extracting tools...');
        let zip;
        try {
            zip = new AdmZip(zipPath);
        } catch (err) {
            console.error('[SdkInstaller] Zip error:', err);
            // Corrupt download, delete
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            throw new Error('Download corrupted. Please retry.');
        }

        // Extract to a temp folder first to handle the internal structure
        const extractPath = path.join(this.sdkRoot, 'cmdline-tools', 'temp');
        zip.extractAllTo(extractPath, true);

        const innerRoot = path.join(extractPath, 'cmdline-tools');
        const finalPath = path.join(this.sdkRoot, 'cmdline-tools', 'latest');

        // Clean previous
        if (fs.existsSync(finalPath)) {
            fs.rmSync(finalPath, { recursive: true, force: true });
        }
        fs.mkdirSync(path.dirname(finalPath), { recursive: true });

        fs.renameSync(innerRoot, finalPath);

        // Cleanup temp
        fs.rmSync(path.join(this.sdkRoot, 'cmdline-tools', 'temp'), { recursive: true, force: true });
        fs.unlinkSync(zipPath);

        // Fix permissions on Linux/Mac
        if (platform !== 'win32') {
            const binPath = path.join(finalPath, 'bin');
            fs.chmodSync(path.join(binPath, 'sdkmanager'), '755');
            fs.chmodSync(path.join(binPath, 'avdmanager'), '755');
        }

        return true;
    }

    async installPackagesWithLicenses(onProgress) {
        if (!this.cmdlineToolsPath) throw new Error('SDK tools not found');
        const sdkmanager = path.join(this.cmdlineToolsPath, 'sdkmanager.bat'); // Use .bat for Windows specifically? Or let node resolve
        // Notes: on windows it's sdkmanager.bat
        const sdkManagerExecutable = os.platform() === 'win32' ? 'sdkmanager.bat' : 'sdkmanager';
        const sdkTool = path.join(this.cmdlineToolsPath, sdkManagerExecutable);

        const env = this.getEnv();

        // Helper to run command with 'yes' input
        const runWithYes = (args, label) => {
            return new Promise((resolve, reject) => {
                // Quote the executable path to handle spaces (e.g., C:\Users\sai sharath\...)
                const command = `"${sdkTool}"`;
                console.log(`[SdkInstaller] Running ${label}: ${command} ${args.join(' ')}`);

                const process = spawn(command, args, {
                    env,
                    shell: true
                });

                // Continuously feed 'y' to accept licenses
                const yesInterval = setInterval(() => {
                    if (process.stdin.writable) {
                        try {
                            process.stdin.write('y\n');
                        } catch (e) {
                            // ignore write errors (broken pipe)
                        }
                    }
                }, 1000);

                process.stdout.on('data', (data) => {
                    const text = data.toString();
                    if (onProgress && text.includes('%')) {
                        onProgress(text.trim());
                    }
                    // console.log(`[${label} stdout]`, text);
                });

                let stderrLog = '';
                process.stderr.on('data', (data) => {
                    stderrLog += data.toString();
                    // console.log(`[${label} stderr]`, data.toString());
                });

                process.on('close', (code) => {
                    clearInterval(yesInterval);
                    if (code === 0) resolve();
                    else reject(new Error(`${label} failed with code ${code}. Stderr: ${stderrLog}`));
                });

                process.on('error', (err) => {
                    clearInterval(yesInterval);
                    reject(err);
                });
            });
        };

        try {
            // Step 1: Accept Licenses
            await runWithYes(['--licenses', `--sdk_root="${this.sdkRoot}"`], 'Licenses');

            // Step 2: Install Packages
            // Note: split packages into individual installs if batched fails? No, batch is usually fine.
            const packages = [
                'platform-tools',
                'emulator',
                'platforms;android-30',
                this.systemImage
            ];

            // Add --verbose to see issues
            await runWithYes([...packages.map(p => `"${p}"`), `--sdk_root="${this.sdkRoot}"`, '--verbose'], 'Install Packages');

            return true;
        } catch (err) {
            console.error('[SdkInstaller] Installation failed:', err);
            throw err;
        }
    }

    async createAvd() {
        if (!this.cmdlineToolsPath) throw new Error('SDK tools not found');

        // Ensure AVD root exists
        if (!fs.existsSync(this.avdRoot)) {
            fs.mkdirSync(this.avdRoot, { recursive: true });
        }

        // Verify system image exists to avoid confusing avdmanager errors
        // system-images;android-30;google_apis;x86_64 -> system-images/android-30/google_apis/x86_64
        const imagePathParts = this.systemImage.split(';');
        const sysImgPath = path.join(this.sdkRoot, ...imagePathParts);
        if (!fs.existsSync(sysImgPath)) {
            throw new Error(`System Image not found at ${sysImgPath}. Environment installation may have failed.`);
        }

        const avdmanager = path.join(this.cmdlineToolsPath, 'avdmanager');

        // We explicitly pass the package path (-k) to avoid ambiguity
        const cmd = `echo no | "${avdmanager}" create avd -n "${this.avdName}" -k "${this.systemImage}" --force`;

        console.log('[SdkInstaller] Creating AVD:', cmd);

        await execAsync(cmd, { env: this.getEnv() });
        return true;
    }
}

module.exports = new SdkInstaller();
