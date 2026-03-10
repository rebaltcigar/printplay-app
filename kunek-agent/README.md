# Kunek Agent

Kunek Agent is a Node.js and Electron-based application designed to manage PC timer sessions in a gaming or internet cafe environment. It provides functionalities for session management, real-time updates, and secure communication between the service and the client application.

## Project Structure

```
kunek-agent
├── service
│   ├── index.js          # Main entry point for the Node.js service
│   ├── session.js        # Handles session management
│   ├── firestore.js      # Manages Firestore interactions
│   ├── ipc.js            # Manages inter-process communication (IPC)
│   ├── watchdog.js       # Implements a watchdog mechanism
│   └── config.json       # Configuration settings for the service
├── launcher
│   ├── main.js           # Main entry point for the Electron application
│   ├── preload.js        # Sets up context bridge for secure communication
│   ├── renderer.js       # Handles rendering logic for the Electron app
│   └── ui
│       └── index.html    # HTML template for the Electron UI
├── keyboard-helper
│   ├── KeyboardHelper.csproj # Project file for the C# keyboard helper
│   └── Program.cs        # Main logic for the keyboard helper
├── scripts
│   ├── provision.js      # Script for provisioning the application
│   └── install.js        # Script for installing the Node.js service
├── package.json          # npm configuration file
├── README.md             # Project documentation
└── .gitignore            # Files and directories to ignore by Git
```

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd kunek-agent
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Provision the application:
   ```
   node scripts/provision.js
   ```

4. Install the service:
   ```
   node scripts/install.js
   ```

## Usage

- Start the Node.js service:
  ```
  node service/index.js
  ```

- Launch the Electron application:
  ```
  npm start
  ```

## Features

- Real-time session management with Firestore.
- Secure IPC communication between the Node.js service and the Electron client.
- Watchdog mechanism to ensure service reliability.
- Low-level keyboard hooks for enhanced security.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.