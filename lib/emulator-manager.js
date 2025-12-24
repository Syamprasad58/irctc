const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const sdkInstaller = require('./sdk-installer');

const execAsync = promisify(exec);

class EmulatorManager {

    getEmulatorPath() {
        const sdkRoot = sdkInstaller.getSdkRoot();
        if (!sdkRoot) throw new Error('SDK not initialized');
        return path.join(sdkRoot, 'emulator', 'emulator');
    }

    getAdbPath() {
        const sdkRoot = sdkInstaller.getSdkRoot();
        if (!sdkRoot) throw new Error('SDK not initialized');
        return path.join(sdkRoot, 'platform-tools', 'adb');
    }

    getEnv() {
        return sdkInstaller.getEnv();
    }

    async listAvds() {
        try {
            const emulatorBin = this.getEmulatorPath();
            const { stdout } = await execAsync(`"${emulatorBin}" -list-avds`, {
                env: this.getEnv()
            });
            return stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        } catch (error) {
            console.error('[EmulatorManager] listAvds error:', error.message);
            return [];
        }
    }

    async cleanupLocks(avdName) {
        try {
            const avdRoot = sdkInstaller.getAvdRoot();
            if (!avdRoot) return;

            const avdDir = path.join(avdRoot, `${avdName}.avd`);
            if (!require('fs').existsSync(avdDir)) return;

            const locks = ['multiinstance.lock', 'hardware-qemu.ini.lock', 'snapshot.lock'];

            for (const lock of locks) {
                const lockPath = path.join(avdDir, lock);
                if (require('fs').existsSync(lockPath)) {
                    try {
                        require('fs').unlinkSync(lockPath);
                        console.log(`[EmulatorManager] Removed stale lock file: ${lock}`);
                    } catch (e) {
                        console.warn(`[EmulatorManager] Failed to remove lock file ${lock}: ${e.message}`);
                    }
                }
            }

            // Also recursively remove directories ending in .lock if any (some versions use folders)
            // But usually for these files unlinkSync works if they are files. 
            // multiinstance.lock is a file in recent versions.
        } catch (error) {
            console.warn(`[EmulatorManager] Lock cleanup failed: ${error.message}`);
        }
    }

    async launchAvd(avdName) {
        const emulatorBin = this.getEmulatorPath();
        console.log(`[EmulatorManager] Launching AVD: ${avdName}`);

        // Clean up stale locks first
        await this.cleanupLocks(avdName);

        const logPath = path.join(path.dirname(__dirname), 'emulator.log');
        const out = require('fs').openSync(logPath, 'w');
        const err = require('fs').openSync(logPath, 'w');

        // Launch detached process
        // -gpu swiftshader_indirect might be safer for headless/cloud envs, but for local user 'auto' is fine or 'host'
        // -no-boot-anim speeds up boot time perception
        const args = ['-avd', avdName, '-no-boot-anim', '-verbose', '-wipe-data'];

        const child = spawn(emulatorBin, args, {
            detached: true,
            stdio: ['ignore', out, err],
            env: this.getEnv()
        });

        child.unref(); // Allow parent to exit independent of child

        return { success: true, pid: child.pid };
    }

    async waitForBoot(timeoutMs = 180000) {
        const adbBin = this.getAdbPath();
        const startTime = Date.now();

        console.log(`[EmulatorManager] Waiting for boot (timeout: ${timeoutMs / 1000}s)...`);

        while (Date.now() - startTime < timeoutMs) {
            try {
                // Check 1: Is device visible?
                const devicesOut = await execAsync(`"${adbBin}" devices`);
                if (!devicesOut.stdout.includes('emulator-')) {
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    if (elapsed % 10 === 0) console.log(`[EmulatorManager] Still waiting for device visibility... (${elapsed}s)`);
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

                // Check 2: Boot completed prop
                const { stdout } = await execAsync(`"${adbBin}" -e shell getprop sys.boot_completed`, {
                    env: this.getEnv(),
                    timeout: 5000 // Ensure shell command doesn't hang
                });

                if (stdout.trim() === '1') {
                    console.log('[EmulatorManager] Boot completed!');
                    return true;
                }

                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                if (elapsed % 10 === 0) console.log(`[EmulatorManager] Device visible, waiting for sys.boot_completed... (${elapsed}s)`);
            } catch (e) {
                // Ignore transient errors
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        throw new Error('Timeout waiting for emulator boot');
    }
}

module.exports = new EmulatorManager();
