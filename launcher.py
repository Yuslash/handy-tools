import tkinter as tk
from tkinter import ttk
import subprocess
import threading
import sys
import os
import re
import time
from pathlib import Path

# Configuration
REPO_DIR = os.path.dirname(os.path.abspath(__file__))
GIT_REMOTE = "origin"
GIT_BRANCH = "main"

class LauncherApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Link Downloader Launcher")
        self.root.geometry("400x250")
        self.root.configure(bg="#09090b")  # Zinc-950 equivalent
        self.root.overrideredirect(True)   # Frameless window
        
        # Center the window
        screen_width = root.winfo_screenwidth()
        screen_height = root.winfo_screenheight()
        x = (screen_width - 400) // 2
        y = (screen_height - 250) // 2
        root.geometry(f"400x250+{x}+{y}")

        # Styles
        style = ttk.Style()
        style.theme_use('clam')
        style.configure("Horizontal.TProgressbar", 
                        troughcolor="#18181b", 
                        background="#ccff00", 
                        bordercolor="#09090b",
                        lightcolor="#ccff00", 
                        darkcolor="#ccff00")
        
        # UI Elements
        self.main_frame = tk.Frame(root, bg="#09090b", highlightbackground="#27272a", highlightthickness=1)
        self.main_frame.pack(fill=tk.BOTH, expand=True)

        # Title
        tk.Label(self.main_frame, text="LINK DOWNLOADER", 
                 bg="#09090b", fg="#ffffff", 
                 font=("Segoe UI", 14, "bold")).pack(pady=(30, 5))
        
        tk.Label(self.main_frame, text="UPDATER & LAUNCHER", 
                 bg="#09090b", fg="#52525b", 
                 font=("Segoe UI", 8, "bold"), spacing2=2).pack(pady=(0, 20))

        # Status Label
        self.status_var = tk.StringVar(value="Initializing...")
        self.status_label = tk.Label(self.main_frame, textvariable=self.status_var, 
                                     bg="#09090b", fg="#a1a1aa", 
                                     font=("Segoe UI", 9))
        self.status_label.pack(pady=5)

        # Progress Bar
        self.progress_var = tk.DoubleVar(value=0)
        self.progress_bar = ttk.Progressbar(self.main_frame, variable=self.progress_var, 
                                            maximum=100, length=300, 
                                            style="Horizontal.TProgressbar", mode='determinate')
        self.progress_bar.pack(pady=10)

        # Details Label (Speed/Progress)
        self.details_var = tk.StringVar(value="")
        self.details_label = tk.Label(self.main_frame, textvariable=self.details_var, 
                                      bg="#09090b", fg="#ccff00", 
                                      font=("Consolas", 8))
        self.details_label.pack(pady=5)

        # Close Button (Hidden by default, shown on error)
        self.close_btn = tk.Button(self.main_frame, text="Exit", command=root.quit,
                                   bg="#ef4444", fg="white", bd=0, padx=10, pady=5,
                                   font=("Segoe UI", 9, "bold"), cursor="hand2")

        # Start process
        self.start_update_process()

    def update_status(self, text, color="#a1a1aa"):
        self.status_label.config(fg=color)
        self.status_var.set(text)

    def update_progress(self, percent, details=""):
        self.progress_var.set(percent)
        if details:
            self.details_var.set(details)

    def show_error(self, message):
        self.update_status(message, "#ef4444")
        self.close_btn.pack(pady=10)
        self.progress_bar.config(style="Error.Horizontal.TProgressbar") # Simplified, just keeping it red if possible, or just ui change

    def start_update_process(self):
        threading.Thread(target=self.check_and_update, daemon=True).start()

    def run_cmd(self, cmd):
        return subprocess.run(cmd, cwd=REPO_DIR, capture_output=True, text=True, encoding='utf-8')

    def check_and_update(self):
        try:
            # 1. Check for valid git repo
            if not os.path.exists(os.path.join(REPO_DIR, ".git")):
                self.root.after(0, self.update_status, "Git repository not found. Skipping update.")
                time.sleep(1)
                self.launch_app()
                return

            # 2. Fetch
            self.root.after(0, self.update_status, "Checking for updates...")
            self.root.after(0, lambda: self.progress_bar.configure(mode='indeterminate'))
            self.root.after(0, self.progress_bar.start, 10)
            
            fetch_res = self.run_cmd(["git", "fetch", GIT_REMOTE])
            if fetch_res.returncode != 0:
                self.root.after(0, self.update_status, "Failed to connect to update server.", "#eab308")
                time.sleep(2)
                self.launch_app()
                return

            # 3. Check diff
            local_hash = self.run_cmd(["git", "rev-parse", "HEAD"]).stdout.strip()
            remote_hash = self.run_cmd(["git", "rev-parse", f"{GIT_REMOTE}/{GIT_BRANCH}"]).stdout.strip()

            if local_hash != remote_hash:
                self.root.after(0, self.progress_bar.stop)
                self.root.after(0, lambda: self.progress_bar.configure(mode='determinate'))
                self.root.after(0, self.update_status, "Update found. Downloading...", "#ccff00")
                self.pull_update()
            else:
                self.root.after(0, self.update_status, "System is up to date.", "#ccff00")
                self.root.after(0, self.update_progress, 100)
                time.sleep(1)
                self.launch_app()

        except Exception as e:
            self.root.after(0, self.show_error, f"Error: {str(e)[:50]}")

    def pull_update(self):
        # We need to run this and parse stdout/stderr for progress
        try:
            process = subprocess.Popen(
                ["git", "pull", GIT_REMOTE, GIT_BRANCH, "--progress"],
                cwd=REPO_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
                encoding='utf-8',
                errors='replace' # Handle potential encoding issues
            )

            # Git writes progress to stderr
            while True:
                line = process.stderr.readline()
                if not line and process.poll() is not None:
                    break
                
                if line:
                    # Regex to parse git progress
                    # Parsing "Receiving objects:  15% (3/19), 12.00 KiB | 24.00 KiB/s"
                    match = re.search(r"Receiving objects:\s+(\d+)%.*?(\d+\.\d+\s+\w+/s)", line)
                    if match:
                        percent = int(match.group(1))
                        speed = match.group(2)
                        self.root.after(0, self.update_progress, percent, f"Downloading: {speed}")
                    elif "Resolving deltas" in line:
                         self.root.after(0, self.update_status, "Applying changes...")

            if process.returncode == 0:
                self.root.after(0, self.update_status, "Update complete!", "#22c55e")
                self.root.after(0, self.update_progress, 100, "")
                time.sleep(1)
                self.launch_app()
            else:
                self.root.after(0, self.show_error, "Update failed. Check manually.")

        except Exception as e:
             self.root.after(0, self.show_error, f"Update Error: {e}")

    def launch_app(self):
        self.root.after(0, self.update_status, "Launching Application...", "#ffffff")
        time.sleep(1)
        self.root.after(0, self.root.destroy)
        
        # Launch using npm run dev command
        # Use shell=True to spawn correctly on Windows
        subprocess.Popen("npm run dev", cwd=REPO_DIR, shell=True)

if __name__ == "__main__":
    root = tk.Tk()
    app = LauncherApp(root)
    root.mainloop()
