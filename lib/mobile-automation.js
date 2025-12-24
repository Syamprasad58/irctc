// lib/mobile-automation.js
const { remote } = require('webdriverio');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const MainFlow = require('./irctc-flows/main-flow');
const emulatorManager = require('./emulator-manager');
const sdkInstaller = require('./sdk-installer');

const execAsync = promisify(exec);

class MobileAutomation {
  constructor() {
    this.driver = null;
    this.isConnected = false;
    this.mainFlow = null;
    this.connectionRetries = 0;
    this.maxRetries = 3;
    this.detectedDevice = null;
  }

  getAdbPath() {
    try {
      return sdkInstaller.getSdkRoot() ? path.join(sdkInstaller.getSdkRoot(), 'platform-tools', 'adb') : 'adb';
    } catch (e) {
      return 'adb'; // Fallback to global path if SDK not ready
    }
  }

  /**
   * Detect available Android devices (emulators and hardware)
   */
  async detectDevices() {
    try {
      const adbBin = this.getAdbPath();
      const { stdout } = await execAsync(`"${adbBin}" devices`, { env: sdkInstaller.getEnv() });
      const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('List of devices'));

      const devices = lines.map(line => {
        const [deviceId, status] = line.trim().split('\t');
        const isEmulator = deviceId.startsWith('emulator-');
        return { deviceId, status, isEmulator };
      }).filter(device => device.status === 'device');

      console.log('[Mobile] Detected devices:', devices);
      return devices;
    } catch (error) {
      console.error('[Mobile] Failed to detect devices:', error.message);
      return [];
    }
  }

  /**
   * Launch managed emulator
   */
  async launchManagedEmulator() {
    const avdName = sdkInstaller.getAvdName();
    console.log('[Mobile] Checking for managed emulator:', avdName);

    // Check if already running
    const devices = await this.detectDevices();
    const existingEmulators = devices.filter(d => d.isEmulator);

    for (const emu of existingEmulators) {
      // Strict check: Is this emulator running OUR avd?
      try {
        // 'adb -s [id] emu avd name' returns the running AVD name
        const adbBin = this.getAdbPath();
        const { stdout } = await execAsync(`"${adbBin}" -s ${emu.deviceId} emu avd name`, {
          env: sdkInstaller.getEnv(),
          timeout: 2000 // Fast timeout
        });

        // Output is typically the name, sometimes followed by 'OK'
        if (stdout.includes(avdName)) {
          console.log(`[Mobile] Found managed emulator running at ${emu.deviceId}`);
          return emu;
        }
      } catch (e) {
        console.warn(`[Mobile] Failed to check AVD name for ${emu.deviceId}`, e.message);
      }
    }

    // If we are here, no managed emulator is running (even if others are).
    // Launch ours.
    console.log('[Mobile] No managed emulator found. Launching new instance...');
    await emulatorManager.launchAvd(avdName);
    await emulatorManager.waitForBoot();

    // Re-detect and find ours
    const newDevices = await this.detectDevices();
    // We explicitly look for the one that matches our name again to be safe
    for (const emu of newDevices.filter(d => d.isEmulator)) {
      try {
        const adbBin = this.getAdbPath();
        const { stdout } = await execAsync(`"${adbBin}" -s ${emu.deviceId} emu avd name`, { env: sdkInstaller.getEnv() });
        if (stdout.includes(avdName)) return emu;
      } catch (e) { }
    }

    // Fallback: just return the first emulator if verification fails (unlikely)
    return newDevices.find(d => d.isEmulator);
  }

  async startAppiumServer() {
    return new Promise((resolve, reject) => {
      const npmCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      // Bind explicitly to 127.0.0.1 to avoid ipv6 ambiguities
      const args = ['-y', 'appium', '--port', '4723', '--address', '127.0.0.1', '--allow-cors'];
      console.log('[Mobile] Starting Appium Server...', npmCmd, args.join(' '));

      const child = require('child_process').spawn(npmCmd, args, {
        shell: true,
        detached: false,
        env: sdkInstaller.getEnv() // Explicitly pass the correct environment
      });

      child.stdout.on('data', (d) => {
        const line = d.toString();
        console.log('[Appium STDOUT]', line.trim());
        // Simple check, works even with ANSI codes usually, but we log it now to be sure
        if (line.includes('Appium REST http interface listener started')) {
          console.log('[Mobile] Appium Server Started');
          resolve(child);
        }
      });

      child.stderr.on('data', (d) => {
        const line = d.toString();
        console.log('[Appium STDERR]', line.trim());
        if (line.includes('Appium REST http interface listener started')) {
          console.log('[Mobile] Appium Server Started (stderr)');
          resolve(child);
        }
      });

      child.on('error', (err) => {
        console.error('[Mobile] Failed to start Appium:', err);
        reject(err);
      });

      // Timeout if it takes too long
      setTimeout(() => {
        console.error('[Mobile] Appium start timeout - 30s expired');
        // Do NOT resolve anyway, this causes the ECONNREFUSED spam
        reject(new Error('Appium refused to start within 30 seconds'));
      }, 30000);
    });
  }

  async isAppiumRunning() {
    try {
      const http = require('http');
      return new Promise((resolve) => {
        const req = http.get('http://127.0.0.1:4723/status', (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });
    } catch (e) {
      return false;
    }
  }

  /**
   * Connect to mobile device via Appium server with automatic device detection
   */
  async connect() {
    try {
      // 0. Start Appium Server if needed
      const running = await this.isAppiumRunning();
      if (running) {
        console.log('[Mobile] Appium server is already running and responsive.');
      } else {
        console.log('[Mobile] Appium server not running or unresponsive. Starting new instance...');
        this.appiumProcess = await this.startAppiumServer();
      }

      // 1. Detect devices
      // We now prioritize our managed emulator.
      // Even if devices exist, we want to ensure WE are running.
      // But if user has physical device, maybe they want that? 
      // User said "don't use user installed emulator... use our project specific emulator".

      // Strategy:
      // Always try to launch/find our managed emulator first.

      let managedDevice = null;
      try {
        managedDevice = await this.launchManagedEmulator();
      } catch (e) {
        console.error('[Mobile] Managed emulator launch failed:', e);
      }

      if (!managedDevice) {
        throw new Error('Failed to start managed emulator');
      }

      // Use the first available device
      this.detectedDevice = managedDevice;
      console.log(`[Mobile] Using device: ${this.detectedDevice.deviceId} (Managed Emulator)`);

      const capabilities = {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2', // Must match installed driver
        'appium:deviceName': this.detectedDevice.deviceId,
        'appium:udid': this.detectedDevice.deviceId,
        'appium:platformVersion': '12', // As per java code, though emulator might differ it's good hint

        // App details
        // 'appium:appPackage': 'cris.org.in.prs.ima',
        // 'appium:appActivity': 'cris.org.in.ima.activities.IRCTCConnectActivity',

        'appium:noReset': true,
        'appium:fullReset': false,
        'appium:newCommandTimeout': 600,

        // Critical permissions & launch settings
        'appium:disableHiddenApiChecks': true,
        'appium:ignoreHiddenApiPolicyError': true,
        'appium:autoLaunch': false,
        'appium:autoGrantPermissions': true,

        'appium:uiautomator2ServerInstallTimeout': 120000,
        'appium:uiautomator2ServerLaunchTimeout': 120000,
        'appium:skipServerInstallation': false,
        'appium:skipDeviceInitialization': false,
        'appium:systemPort': 8200 + Math.floor(Math.random() * 100)
      };

      console.log('[Mobile] Using capabilities:', JSON.stringify(capabilities, null, 2));

      try {
        this.driver = await remote({
          protocol: 'http',
          hostname: '127.0.0.1', // Force IPv4
          port: 4723,
          path: '/',
          capabilities,
          connectionRetryCount: 5,
          connectionRetryTimeout: 60000
        });
      } catch (connError) {
        // Handle specific case: Appium running but missing environment variables
        if (connError.message.includes('ANDROID_HOME') || connError.message.includes('ANDROID_SDK_ROOT')) {
          console.warn('[Mobile] Appium Server missing Android Env. Restarting...');

          await this.killExternalAppium();
          this.appiumProcess = await this.startAppiumServer();

          // Retry connection once
          this.driver = await remote({
            protocol: 'http',
            hostname: '127.0.0.1',
            port: 4723,
            path: '/',
            capabilities,
            connectionRetryCount: 3,
            connectionRetryTimeout: 60000
          });
        } else {
          throw connError;
        }
      }

      this.isConnected = true;
      this.mainFlow = new MainFlow(this.driver);

      // Auto-install APK if needed
      await this.ensureAppInstalled();

      // Explicitly activate app as per Java code reference
      console.log('[Mobile] Activating app: cris.org.in.prs.ima');
      await this.driver.activateApp('cris.org.in.prs.ima');

      // WAIT FOR ACTIVITY - The user requested "wait until Appactivity launches"
      // Based on IRCTC common activities
      const mainActivity = 'cris.org.in.ima.activities.IRCTCConnectActivity';
      console.log(`[Mobile] Waiting for activity: ${mainActivity}...`);

      try {
        await this.driver.waitUntil(async () => {
          const activity = await this.driver.getCurrentActivity();
          console.log(`[Mobile] Current activity: ${activity}`);
          return activity && (activity.includes('IRCTCConnectActivity') || activity.includes('HomeActivity'));
        }, {
          timeout: 20000,
          timeoutMsg: 'App activity did not load in time'
        });
      } catch (e) {
        console.warn('[Mobile] Activity wait timeout, continuing anyway...');
      }

      await this.driver.pause(3000); // Give it a moment to render UI

      this.connectionRetries = 0;
      console.log(`[Mobile] Connected to ${this.detectedDevice.isEmulator ? 'emulator' : 'hardware device'} successfully`);
      return {
        success: true,
        message: `Connected to ${this.detectedDevice.isEmulator ? 'emulator' : 'hardware device'}: ${this.detectedDevice.deviceId}`,
        device: this.detectedDevice
      };

    } catch (error) {
      console.error('[Mobile] Connection failed:', error.message);
      this.isConnected = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if IRCTC app is installed, if not install it from local assets
   */
  async ensureAppInstalled() {
    try {
      const packageName = 'cris.org.in.prs.ima';
      const isInstalled = await this.driver.isAppInstalled(packageName);

      if (isInstalled) {
        console.log('[Mobile] IRCTC App is already installed.');
        return;
      }

      console.log('[Mobile] IRCTC App NOT installed. Installing from assets...');

      // Path to APK: src/asserts/apks/irctc-rail-connect-4-2-50.apk
      // We are in lib/, so go up one level
      const apkPath = path.resolve(__dirname, '..', 'src', 'asserts', 'apks', 'irctc-rail-connect-4-2-50.apk');

      if (!require('fs').existsSync(apkPath)) {
        console.error(`[Mobile] APK file NOT found at: ${apkPath}`);
        return;
      }

      await this.driver.installApp(apkPath);
      console.log('[Mobile] IRCTC App installed successfully.');

    } catch (err) {
      console.error('[Mobile] Failed to check/install app:', err.message);
    }
  }

  /**
   * Check if driver is still responsive and reconnect if needed
   */
  async ensureConnection() {
    try {
      if (!this.driver || !this.isConnected) {
        throw new Error('Driver not connected');
      }

      // Test driver responsiveness with a simple command
      await this.driver.getCurrentActivity();
      return { success: true };
    } catch (error) {
      console.log('[Mobile] Connection lost, attempting to reconnect...');

      if (this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        await this.forceDisconnect();
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        const reconnectResult = await this.connect();

        if (reconnectResult.success) {
          console.log(`[Mobile] Reconnected successfully (attempt ${this.connectionRetries}/${this.maxRetries})`);
          return { success: true };
        }
      }

      return { success: false, error: 'Failed to restore connection after ' + this.maxRetries + ' attempts' };
    }
  }

  /**
   * Force disconnect without throwing errors
   */
  async forceDisconnect() {
    try {
      if (this.driver) {
        await this.driver.deleteSession();
      }
    } catch (error) {
      console.log('[Mobile] Force disconnect error (ignored):', error.message);
    } finally {
      this.driver = null;
      this.isConnected = false;
      this.mainFlow = null;
    }
  }

  /**
   * Get information about the currently connected device
   */
  getDeviceInfo() {
    return this.detectedDevice;
  }

  /**
   * Disconnect from mobile device
   */
  async disconnect() {
    try {
      if (this.driver) {
        await this.driver.deleteSession();
        this.driver = null;
      }
      this.isConnected = false;
      this.mainFlow = null;
      this.detectedDevice = null;
      console.log('[Mobile] Disconnected from device');
      return { success: true };
    } catch (error) {
      console.error('[Mobile] Disconnect error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Kill any process listening on port 4723 (Appium)
   */
  async killExternalAppium() {
    console.log('[Mobile] Killing existing Appium process on port 4723...');
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('netstat -ano | findstr :4723');
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          // Ensure PID is numeric to avoid killing random things
          if (pid && /^\d+$/.test(pid)) {
            try {
              await execAsync(`taskkill /PID ${pid} /F`);
              console.log(`[Mobile] Killed process ${pid}`);
            } catch (e) { /* ignore already dead */ }
          }
        }
      } else {
        await execAsync('lsof -t -i:4723 | xargs kill -9');
      }
    } catch (e) {
      console.log('[Mobile] Failed to kill 4723 (maybe not running?). Ignored.');
    }
  }

  /**
   * Execute booking flow with CAPTCHA automation and connection recovery
   */
  async completeBookingFlow(credentials, ticketData, useAutoCaptcha = true) {
    if (!this.isConnected || !this.driver || !this.mainFlow) {
      // Auto connect
      const connectRes = await this.connect();
      if (!connectRes.success) {
        return { success: false, error: 'Device not connected. Call connect() first.' };
      }
    }

    try {
      const result = await this.mainFlow.completeBooking(credentials, ticketData, useAutoCaptcha);
      this.connectionRetries = 0;
      return result;
    } catch (error) {
      // Handle UiAutomator2 crashes
      if (this.isUiAutomator2Error(error)) {
        console.log('[Mobile] UiAutomator2 crash detected, attempting recovery...');

        const recoveryResult = await this.ensureConnection();
        if (recoveryResult.success) {
          console.log('[Mobile] Connection recovered, retrying booking flow...');
          try {
            return await this.mainFlow.completeBooking(credentials, ticketData, useAutoCaptcha);
          } catch (retryError) {
            return { success: false, error: 'Retry failed after recovery: ' + retryError.message };
          }
        } else {
          return { success: false, error: 'UiAutomator2 crashed and recovery failed: ' + recoveryResult.error };
        }
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Login with automatic CAPTCHA solving and connection recovery
   */
  async loginWithCaptcha(username, password, pin = null, useAutoCaptcha = true) {
    if (!this.isConnected || !this.driver) {
      const connectRes = await this.connect();
      if (!connectRes.success) {
        return { success: false, error: 'Device not connected. Call connect() first.' };
      }
    }

    const LoginPage = require('./irctc-flows/login-page');
    const loginPage = new LoginPage(this.driver);

    try {
      const result = await loginPage.loginWithCaptcha(
        username,
        password,
        '//android.widget.ImageView[@resource-id="cris.org.in.prs.ima:id/captcha"]',
        useAutoCaptcha
      );

      this.connectionRetries = 0;
      return result;
    } catch (error) {
      // Handle UiAutomator2 crashes
      if (this.isUiAutomator2Error(error)) {
        console.log('[Mobile] UiAutomator2 crash detected during login, attempting recovery...');

        const recoveryResult = await this.ensureConnection();
        if (recoveryResult.success) {
          console.log('[Mobile] Connection recovered, retrying login...');
          try {
            const newLoginPage = new LoginPage(this.driver);
            return await newLoginPage.loginWithCaptcha(
              username,
              password,
              '//android.widget.ImageView[@resource-id="cris.org.in.prs.ima:id/captcha"]',
              useAutoCaptcha
            );
          } catch (retryError) {
            return { success: false, error: 'Login retry failed after recovery: ' + retryError.message };
          }
        } else {
          return { success: false, error: 'UiAutomator2 crashed during login and recovery failed: ' + recoveryResult.error };
        }
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Check if error is related to UiAutomator2 crash
   */
  isUiAutomator2Error(error) {
    const errorMessage = error.message.toLowerCase();
    return errorMessage.includes('uiautomator2') ||
      errorMessage.includes('instrumentation process') ||
      errorMessage.includes('cannot be proxied') ||
      errorMessage.includes('probably crashed');
  }
}

module.exports = MobileAutomation;