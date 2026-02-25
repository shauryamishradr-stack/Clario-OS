const { app, BrowserWindow, session } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        title: "Clario OS",
        icon: path.join(__dirname, 'icon.png'), // Add an icon if you have one later
        backgroundColor: '#0b0f19',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false // This allows bypass of some restrictions
        }
    });

    // Remove the default menu bar
    win.removeMenu();

    // Load the local app.html (Workspace)
    win.loadFile('app.html');

    // STRATEGY: Intercept headers to allow EVERYTHING in iframes
    // This is the "Secret Sauce" that makes Google/YouTube/GitHub work in your panels.
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        let responseHeaders = details.responseHeaders;

        // Delete headers that block iframes
        const headersToRemove = [
            'x-frame-options',
            'content-security-policy',
            'x-content-security-policy',
            'x-webkit-csp'
        ];

        Object.keys(responseHeaders).forEach(header => {
            if (headersToRemove.includes(header.toLowerCase())) {
                delete responseHeaders[header];
            }
        });

        callback({
            cancel: false,
            responseHeaders: responseHeaders
        });
    });
}

// Enable hardware acceleration for smooth glassmorphism animations
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-oop-rasterization');

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
