// main.js
// Polyfill for ReadableStream to fix WebDriverIO compatibility
if (typeof global.ReadableStream === 'undefined') {
  global.ReadableStream = require('stream/web').ReadableStream;
}
if (typeof global.WritableStream === 'undefined') {
  global.WritableStream = require('stream/web').WritableStream;
}
if (typeof global.TransformStream === 'undefined') {
  global.TransformStream = require('stream/web').TransformStream;
}

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// DB module
const dbModule = require('./lib/database');

// Mobile automation module
const MobileAutomation = require('./lib/mobile-automation');
const mobileBot = new MobileAutomation();



const isDev = process.env.NODE_ENV === 'development';

let mainWin = null;
let usersWin = null;
let paymentDetailsWin = null;
let newTicketWin = null;

function createMainWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[main] preloadPath ->', preloadPath);
  try {
    fs.accessSync(preloadPath, fs.constants.R_OK);
  } catch (err) {
    console.error(`[main] preload.js not found or not readable at: ${preloadPath}`);
  }

  mainWin = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  if (isDev) {
    mainWin.webContents.openDevTools({ mode: 'detach' });
  }

  mainWin.loadFile(path.join(__dirname, 'src', 'index.html'));
  return mainWin;
}

function createUsersWindow() {
  if (usersWin && !usersWin.isDestroyed()) {
    usersWin.focus();
    return usersWin;
  }

  const preloadPath = path.join(__dirname, 'preload.js');

  usersWin = new BrowserWindow({
    width: 760,
    height: 520,
    parent: mainWin,
    modal: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (isDev) {
    usersWin.webContents.openDevTools({ mode: 'detach' });
  }

  usersWin.loadFile(path.join(__dirname, 'src', 'windows', 'users.html'));

  usersWin.on('closed', () => {
    usersWin = null;
  });

  return usersWin;
}

function createPaymentDetailsWindow() {
  if (paymentDetailsWin && !paymentDetailsWin.isDestroyed()) {
    paymentDetailsWin.focus();
    return paymentDetailsWin;
  }

  const preloadPath = path.join(__dirname, 'preload.js');

  paymentDetailsWin = new BrowserWindow({
    width: 900,
    height: 600,
    parent: mainWin,
    modal: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (isDev) {
    paymentDetailsWin.webContents.openDevTools({ mode: 'detach' });
  }

  paymentDetailsWin.loadFile(path.join(__dirname, 'src', 'windows', 'payment-details.html'));

  paymentDetailsWin.on('closed', () => {
    paymentDetailsWin = null;
  });

  return paymentDetailsWin;
}
function createProxyDetailsWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');

  const proxyDetailsWin = new BrowserWindow({
    width: 800,
    height: 1000,
    parent: mainWin,
    modal: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  if (isDev) {
    proxyDetailsWin.webContents.openDevTools({ mode: 'detach' });
  }
  proxyDetailsWin.loadFile(path.join(__dirname, 'src', 'windows', 'proxy-details.html'));
}

function createNewTicketWindow() {
  if (newTicketWin && !newTicketWin.isDestroyed()) {
    newTicketWin.focus();
    return newTicketWin;
  }

  const preloadPath = path.join(__dirname, 'preload.js');

  newTicketWin = new BrowserWindow({
    width: 1100,
    height: 700,
    parent: mainWin,
    modal: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (isDev) {
    newTicketWin.webContents.openDevTools({ mode: 'detach' });
  }

  newTicketWin.loadFile(path.join(__dirname, 'src', 'windows', 'new-ticket.html'));

  newTicketWin.on('closed', () => {
    newTicketWin = null;
  });

  return newTicketWin;
}

function createTicketsWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');

  const ticketsWin = new BrowserWindow({
    width: 900,
    height: 600,
    parent: mainWin,
    modal: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (isDev) {
    ticketsWin.webContents.openDevTools({ mode: 'detach' });
  }

  ticketsWin.loadFile(path.join(__dirname, 'src', 'windows', 'tickets.html'));

  ticketsWin.webContents.setWindowOpenHandler((details) => {
    const url = new URL(details.url);
    if (url.pathname.endsWith('new-ticket.html')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1100,
          height: 700,
          parent: ticketsWin,
          modal: false,
          webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      };
    }
    // Deny all other window open requests.
    return { action: 'deny' };
  });

  return ticketsWin;
}

function createAutomationWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');

  const automationWin = new BrowserWindow({
    width: 1000,
    height: 700,
    parent: mainWin,
    modal: false,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (isDev) {
    automationWin.webContents.openDevTools({ mode: 'detach' });
  }

  automationWin.loadFile(path.join(__dirname, 'src', 'windows', 'automation.html'));

  return automationWin;
}
// Modules
const sdkInstaller = require('./lib/sdk-installer');
const prerequisiteChecker = require('./lib/prerequisite-checker');

let setupWin = null;

function createSetupWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  setupWin = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  setupWin.loadFile(path.join(__dirname, 'src', 'windows', 'setup.html'));
  if (isDev) setupWin.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(async () => {
  try {
    const userDataPath = app.getPath('userData');

    // Initialize DB
    await dbModule.init(userDataPath);
    console.log("[DB PATH]", dbModule.getDbPath());

    // Initialize SDK Installer path
    sdkInstaller.init(userDataPath);

    // Apply Android environment variables to the current process
    // This ensures any spawned helpers (like Appium) inherit ANDROID_HOME
    const androidEnv = sdkInstaller.getEnv();
    Object.assign(process.env, androidEnv);
    console.log('[Main] Android Environment variables configured:', androidEnv.ANDROID_HOME);

    // CHECK ENVIRONMENT
    const sdkStatus = await sdkInstaller.checkEnvironment();

    if (sdkStatus.valid) {
      console.log('[Main] Android Environment Valid. Starting Main Window.');
      createMainWindow();
    } else {
      console.log('[Main] Android Environment Missing. Starting Setup Window.');
      console.log('[Debug]', sdkStatus);
      createSetupWindow();
    }

  } catch (err) {
    console.error('Failed to initialize:', err);
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); // Re-check? Ideally just open main
  });
});

/* Setup IPC Handlers */

ipcMain.handle('setup:start', async (event) => {
  const sender = event.sender;
  const send = (data) => sender.send('setup:status', data);

  try {
    // 1. Prerequisite Check
    send({ step: 'prereq', message: 'Checking System Prerequisites...' });
    let prereq = await prerequisiteChecker.checkAll();

    if (!prereq.success) {
      if (!prereq.java.success) {
        send({ step: 'prereq', message: 'Java not found. Installing OpenJDK 8...' });
        try {
          await sdkInstaller.installJava((downloaded, total) => {
            const percentage = Math.round((downloaded / total) * 100);
            send({ step: 'prereq', message: `Downloading Java... ${percentage}%`, progress: percentage });
          });

          // Update PATH for this process so subsequent checks and tools work
          const javaBin = sdkInstaller.getJavaBinPath();
          process.env.PATH = `${javaBin}${path.delimiter}${process.env.PATH}`;
          process.env.JAVA_HOME = path.dirname(javaBin);

          send({ step: 'prereq', message: 'Java installed. Verifying...' });
          prereq = await prerequisiteChecker.checkAll();

          if (!prereq.success) {
            throw new Error("Java installation failed verification: " + (prereq.java.message || prereq.virtualization.message));
          }

        } catch (e) {
          throw new Error("Failed to auto-install Java: " + e.message);
        }
      } else {
        throw new Error(prereq.java.message || prereq.virtualization.message);
      }
    }

    // 2. Download Tools
    send({ step: 'download', message: 'Downloading Android Command Line Tools...', progress: 0 });
    await sdkInstaller.downloadCmdlineTools((downloaded, total) => {
      const percentage = Math.round((downloaded / total) * 100);
      send({ step: 'download', message: `Downloading... ${percentage}%`, progress: percentage });
    });

    // 3. Install Packages
    send({ step: 'install', message: 'Installing Emulator & System Images (this takes time)...', progress: 0 });
    await sdkInstaller.installPackagesWithLicenses((status) => {
      send({ step: 'install', message: `Installing: ${status}` });
    });

    // 4. Create AVD
    send({ step: 'create', message: 'Creating Virtual Device...' });
    await sdkInstaller.createAvd();

    // Done
    send({ complete: true });
    return { success: true };

  } catch (err) {
    console.error('Setup failed:', err);
    send({ error: err.message });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('setup:complete', () => {
  if (setupWin) {
    setupWin.close();
    setupWin = null;
  }
  createMainWindow();
});

app.on('window-all-closed', async function () {
  try {
    await dbModule.close();
    if (isDev) console.log('DB closed');
  } catch (err) {
    console.error('Error closing DB:', err);
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/* IPC handlers */

// Open native file dialog
ipcMain.handle('app:openFileDialog', async (event, opts) => {
  const result = await dialog.showOpenDialog(opts || { properties: ['openFile'] });
  return result;
});

// Open users window
ipcMain.handle('app:openUsers', async () => {
  try {
    createUsersWindow();
    return { success: true };
  } catch (err) {
    console.error('Failed to open users window:', err);
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('app:openProxyDetails', async () => {
  try {
    createProxyDetailsWindow();
    return { success: true };
  } catch (err) {
    console.error('Failed to open proxy details window:', err);
    return { success: false, error: err.message || String(err) };
  }
});
// Open payment details window
ipcMain.handle('app:openPaymentDetails', async () => {
  try {
    createPaymentDetailsWindow();
    return { success: true };
  } catch (err) {
    console.error('Failed to open payment details window:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// Open new ticket window
ipcMain.handle('app:openNewTicket', async () => {
  try {
    createNewTicketWindow();
    return { success: true };
  } catch (err) {
    console.error('Failed to open new ticket window:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// Open tickets window
ipcMain.handle('app:openTickets', async () => {
  try {
    createTicketsWindow();
    return { success: true };
  } catch (err) {
    console.error('Failed to open tickets window:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// Open automation window
ipcMain.handle('app:openAutomation', async () => {
  try {
    createAutomationWindow();
    return { success: true };
  } catch (err) {
    console.error('Failed to open automation window:', err);
    return { success: false, error: err.message || String(err) };
  }
});
// DB: get users
ipcMain.handle('db:getUsers', async () => {
  try {
    const rows = await dbModule.getUsers();
    return { success: true, rows };
  } catch (err) {
    console.error('db:getUsers error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: add user
ipcMain.handle('db:addUser', async (event, user) => {
  try {
    const result = await dbModule.addUser(user);
    return { success: true, id: result.id };
  } catch (err) {
    console.error('db:addUser error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: delete user
ipcMain.handle('db:deleteUser', async (event, id) => {
  try {
    const result = await dbModule.deleteUser(id);
    return { success: true, deleted: result.deleted };
  } catch (err) {
    console.error('db:deleteUser error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: get payment details
ipcMain.handle('db:getPaymentDetails', async (event, type) => {
  try {
    const rows = await dbModule.getPaymentDetails(type);
    return { success: true, rows };
  } catch (err) {
    console.error('db:getPaymentDetails error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: add payment detail
ipcMain.handle('db:addPaymentDetail', async (event, paymentDetail) => {
  try {
    const result = await dbModule.addPaymentDetail(paymentDetail);
    return { success: true, id: result.id };
  } catch (err) {
    console.error('db:addPaymentDetail error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: delete payment detail
ipcMain.handle('db:deletePaymentDetail', async (event, id) => {
  try {
    const result = await dbModule.deletePaymentDetail(id);
    return { success: true, deleted: result.deleted };
  } catch (err) {
    console.error('db:deletePaymentDetail error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: get proxies
ipcMain.handle('db:getProxies', async () => {
  try {
    const rows = await dbModule.getProxies();
    return { success: true, rows };
  } catch (err) {
    console.error('db:getProxies error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: add proxy
ipcMain.handle('db:addProxy', async (event, proxy) => {
  try {
    const result = await dbModule.addProxy(proxy);
    return { success: true, id: result.id };
  } catch (err) {
    console.error('db:addProxy error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: delete proxy
ipcMain.handle('db:deleteProxy', async (event, id) => {
  try {
    const result = await dbModule.deleteProxy(id);
    return { success: true, deleted: result.deleted };
  } catch (err) {
    console.error('db:deleteProxy error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: get tickets
ipcMain.handle('db:getTickets', async () => {
  try {
    const rows = await dbModule.getTickets();
    return { success: true, rows };
  } catch (err) {
    console.error('db:getTickets error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: delete ticket
ipcMain.handle('db:deleteTicket', async (event, id) => {
  try {
    const result = await dbModule.deleteTicket(id);
    return { success: true, deleted: result.deleted };
  } catch (err) {
    console.error('db:deleteTicket error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: update user
ipcMain.handle('db:updateUser', async (event, id, user) => {
  try {
    const result = await dbModule.updateUser(id, user);
    return { success: true, updated: result.updated };
  } catch (err) {
    console.error('db:updateUser error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: update payment detail
ipcMain.handle('db:updatePaymentDetail', async (event, id, paymentDetail) => {
  try {
    const result = await dbModule.updatePaymentDetail(id, paymentDetail);
    return { success: true, updated: result.updated };
  } catch (err) {
    console.error('db:updatePaymentDetail error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: update proxy
ipcMain.handle('db:updateProxy', async (event, id, proxy) => {
  try {
    const result = await dbModule.updateProxy(id, proxy);
    return { success: true, updated: result.updated };
  } catch (err) {
    console.error('db:updateProxy error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: update ticket
ipcMain.handle('db:updateTicket', async (event, id, ticket) => {
  try {
    const result = await dbModule.updateTicket(id, ticket);
    return { success: true, updated: result.updated };
  } catch (err) {
    console.error('db:updateTicket error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// DB: add ticket
ipcMain.handle('db:addTicket', async (event, ticket) => {
  try {
    const result = await dbModule.addTicket(ticket);
    return { success: true, id: result.id };
  } catch (err) {
    console.error('db:addTicket error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// App: bulk import (main already had this)
ipcMain.handle('app:bulkImportPassengers', async (event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') throw new Error('filePath required');
    if (!fs.existsSync(filePath)) throw new Error('file not found');

    const txt = fs.readFileSync(filePath, 'utf8');
    const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const rows = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(',').map(s => s.trim());
      if (i === 0) {
        const first = parts[0] ? parts[0].toLowerCase() : '';
        if (first.includes('name') || first.includes('username')) continue;
      }
      const name = parts[0] || null;
      const password = parts[1] || null;
      if (!name || !password) continue;
      rows.push({ name, password });
    }

    const res = await dbModule.bulkInsertUsers(rows);
    return { success: true, ...res };
  } catch (err) {
    console.error('app:bulkImportPassengers error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// Mobile Automation IPC Handlers

// Connect to mobile device
ipcMain.handle('mobile:connect', async () => {
  try {
    const result = await mobileBot.connect();
    return result;
  } catch (err) {
    console.error('mobile:connect error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// Disconnect from mobile device
ipcMain.handle('mobile:disconnect', async () => {
  try {
    const result = await mobileBot.disconnect();
    return result;
  } catch (err) {
    console.error('mobile:disconnect error:', err);
    return { success: false, error: err.message || String(err) };
  }
});



// Login to IRCTC mobile app
ipcMain.handle('mobile:login', async (event, credentials) => {
  try {
    if (!credentials || !credentials.username || !credentials.password) {
      throw new Error('Username and password are required');
    }

    const result = await mobileBot.loginToIRCTC(credentials.username, credentials.password);
    return result;
  } catch (err) {
    console.error('mobile:login error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// Login with manual captcha handling
ipcMain.handle('mobile:loginWithCaptcha', async (event, credentials) => {
  try {
    if (!credentials || !credentials.username || !credentials.password) {
      throw new Error('Username and password are required');
    }

    const result = await mobileBot.loginWithCaptcha(credentials.username, credentials.password, credentials.pin);
    return result;
  } catch (err) {
    console.error('mobile:loginWithCaptcha error:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// Complete automation flow
ipcMain.handle('automation:startBooking', async (event, data) => {
  try {
    if (!data || !data.credentials || !data.ticketData) {
      throw new Error('Missing credentials or ticket data');
    }

    const result = await mobileBot.completeBookingFlow(data.credentials, data.ticketData, true);
    return result;
  } catch (err) {
    console.error('automation:startBooking error:', err);
    return { success: false, error: err.message || String(err) };
  }
});




