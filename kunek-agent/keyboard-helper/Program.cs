using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.IO;
using System.Threading.Tasks;
using System.IO.Pipes;

namespace KeyboardHelper
{
    class Program
    {
        private static NamedPipeServerStream pipeServer;

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            // Set up the named pipe server for IPC
            pipeServer = new NamedPipeServerStream("KunekAgent", PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
            StartPipeServer();

            // Set up low-level keyboard hook
            Application.Run(new KeyboardHookForm());
        }

        private static async void StartPipeServer()
        {
            while (true)
            {
                await pipeServer.WaitForConnectionAsync();
                ProcessPipeMessages();
                pipeServer.Disconnect();
            }
        }

        private static void ProcessPipeMessages()
        {
            using (var reader = new StreamReader(pipeServer))
            {
                string message;
                while ((message = reader.ReadLine()) != null)
                {
                    HandleMessage(message);
                }
            }
        }

        private static void HandleMessage(string message)
        {
            // Handle IPC messages (LOCK/UNLOCK)
            if (message == "LOCK")
            {
                LockWorkStation();
            }
            else if (message == "UNLOCK")
            {
                // Handle unlock logic if needed
            }
        }

        private static void LockWorkStation()
        {
            // Lock the workstation
            Process.Start("rundll32.exe", "user32.dll,LockWorkStation");
        }
    }

    public class KeyboardHookForm : Form
    {
        private const int WH_KEYBOARD_LL = 13;
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int VK_TAB = 0x09;
        private const int VK_ESCAPE = 0x1B;
        private const int VK_LWIN = 0x5B;
        private const int VK_RWIN = 0x5C;
        private const int VK_F4 = 0x73;

        private LowLevelKeyboardProc _proc;
        private IntPtr _hookID = IntPtr.Zero;

        public KeyboardHookForm()
        {
            this.FormBorderStyle = FormBorderStyle.None;
            this.ShowInTaskbar = false;
            this.Load += (s, e) => { this.Size = new System.Drawing.Size(0, 0); };
            
            _proc = HookCallback;
            _hookID = SetHook(_proc);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            UnhookWindowsHookEx(_hookID);
            base.OnFormClosing(e);
        }

        private IntPtr SetHook(LowLevelKeyboardProc proc)
        {
            using (Process curProcess = Process.GetCurrentProcess())
            using (ProcessModule curModule = curProcess.MainModule)
            {
                return SetWindowsHookEx(WH_KEYBOARD_LL, proc,
                    GetModuleHandle(curModule.ModuleName), 0);
            }
        }

        private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

        private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && (wParam == (IntPtr)WM_KEYDOWN || wParam == (IntPtr)WM_SYSKEYDOWN))
            {
                int vkCode = Marshal.ReadInt32(lParam);
                Keys key = (Keys)vkCode;

                bool alt = (Control.ModifierKeys & Keys.Alt) != 0;
                bool control = (Control.ModifierKeys & Keys.Control) != 0;

                // Block Alt+Tab
                if (key == Keys.Tab && alt) return (IntPtr)1;
                
                // Block Win key
                if (key == Keys.LWin || key == Keys.RWin) return (IntPtr)1;

                // Block Alt+F4
                if (key == Keys.F4 && alt) return (IntPtr)1;

                // Block Alt+Esc, Ctrl+Esc
                if (key == Keys.Escape && (alt || control)) return (IntPtr)1;
            }
            return CallNextHookEx(_hookID, nCode, wParam, lParam);
        }

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);
    }
}