const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');
const execAsync = promisify(exec);

class PrerequisiteChecker {
  /**
   * Check if Java is installed and accessible in PATH
   * Android SDK tools require Java (JDK 8+)
   */
  async checkJava() {
    try {
      const { stdout, stderr } = await execAsync('java -version');
      // combine output to find version string
      const output = (stdout || '') + (stderr || '');

      // Look for version pattern: version "17.0.1" or "1.8.0"
      const versionMatch = output.match(/version "(\d+)(\.|\.|_)/);
      if (versionMatch && versionMatch[1]) {
        const majorVersion = parseInt(versionMatch[1], 10);
        // Java 8 is "1.8", so major is 1
        // Java 17 is "17"
        // We need >= 17 for latest Android tools
        // If 1.x, it's old.
        if (majorVersion >= 17) {
          return { success: true, message: `Java ${majorVersion} is installed` };
        } else {
          return {
            success: false,
            message: `Java ${majorVersion} found, but Java 17 or newer is required for Android tools.`
          };
        }
      }

      return { success: false, message: 'Could not determine Java version from output: ' + output };
    } catch (error) {
      if (error.stderr && error.stderr.includes('version')) {
        // Try parsing gracefully even if it "failed" (exit code non-zero?)
        const output = error.stderr;
        const versionMatch = output.match(/version "(\d+)(\.|\.|_)/);
        if (versionMatch && versionMatch[1]) {
          const majorVersion = parseInt(versionMatch[1], 10);
          if (majorVersion >= 17) return { success: true, message: `Java ${majorVersion} (detected)` };
          else return { success: false, message: `Java ${majorVersion} found, but Java 17+ is required.` };
        }
      }
      return {
        success: false,
        message: 'Java (JDK) not found or not working. Please install Java 17 or newer.',
        details: error.message
      };
    }
  }

  /**
   * Check if Hardware Virtualization is supported (Required for Emulator)
   * Linux: KVM
   * Windows: Hyper-V or HAXM
   */
  async checkVirtualization() {
    const platform = os.platform();

    try {
      if (platform === 'linux') {
        try {
          // On Linux, we check kvm-ok (from cpu-checker) or check /dev/kvm
          await execAsync('kvm-ok');
          return { success: true, message: 'KVM acceleration is usable' };
        } catch (e) {
          // Fallback: check if /dev/kvm exists and is readable
          try {
            await execAsync('test -r /dev/kvm');
            return { success: true, message: '/dev/kvm is accessible' };
          } catch (kError) {
            return { success: false, message: 'KVM is not accessible. Please install `cpu-checker` and ensure your user is in the `kvm` group.' };
          }
        }
      } else if (platform === 'win32') {
        // Simple check: systeminfo 
        // Real check is complex on Windows (Hyper-V vs HAXM), but we rely on valid exit of checks
        // Usually, the emulator installer will fail if HAXM/Hyper-V isn't possible, 
        // but checking beforehand is hard without admin scripts.
        // We will optimistically assume yes for now or check specifically if needed.
        return { success: true, message: 'Virtualization check skipped for Windows (handled by installer)' };
      } else if (platform === 'darwin') {
        return { success: true, message: 'Virtualization presumed available on macOS' };
      }

      return { success: true, message: 'Virtualization check not implemented for this OS' };
    } catch (error) {
      return { success: false, message: 'Virtualization check failed', error: error.message };
    }
  }

  async checkAll() {
    const java = await this.checkJava();
    const virt = await this.checkVirtualization();

    return {
      success: java.success && virt.success,
      java,
      virtualization: virt
    };
  }
}

module.exports = new PrerequisiteChecker();
