# VS Code Setup & Usage Guide for SpeakReady

**Your VS Code is now configured! Follow this guide to run the application.**

---

## ✅ **VS Code is Opening!**

The project should now be open in VS Code. If not, manually open it:
1. Open VS Code
2. File → Open Folder
3. Navigate to: `C:\Users\Hemavathy\Desktop\speakready\speakready`
4. Click "Select Folder"

---

## 🚀 **How to Run the Application (3 Easy Methods)**

### **Method 1: Using Run and Debug (Easiest)**

1. **Click the "Run and Debug" icon** in the left sidebar (▶️ icon)
2. **Select from dropdown:**
   - **"🚀 Run Full App"** - Starts both frontend + backend
   - **"🎨 Frontend Only"** - React app only
   - **"⚙️ Backend API Only"** - Express server only
3. **Click the green play button** ▶️
4. Wait for servers to start
5. Open browser: http://localhost:5173

### **Method 2: Using Tasks (Ctrl+Shift+P)**

1. **Press:** `Ctrl + Shift + P` (Command Palette)
2. **Type:** `Tasks: Run Task`
3. **Select:**
   - **"🚀 Start Full App"** - Both servers
   - **"🎨 Start Frontend Only"** - React only
   - **"⚙️ Start Backend Only"** - API only
4. Terminal opens and runs the command

### **Method 3: Using Integrated Terminal**

1. **Open Terminal:** Press `` Ctrl + ` `` (backtick) or View → Terminal
2. **Type:**
   ```bash
   npm run dev
   ```
3. Press Enter

---

## 📺 **What You'll See in VS Code**

### When Running Full App:

```
Terminal 1: Frontend (Vite)
  VITE v6.4.3  ready in 2276 ms
  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose

Terminal 2: Backend (Express)
  SpeakReady API on :4001 (AI live, storage supabase)
```

---

## 🎯 **VS Code Features Configured**

### 1. **Run Configurations** (F5 or Run icon)
- 🚀 Run Full App (Frontend + Backend)
- 🎨 Frontend Only (React + Vite)
- ⚙️ Backend API Only (Express)
- 🐛 Debug Backend API (with breakpoints!)
- 🌱 Seed Database
- 👤 Create Admin User
- 🎯 Full Stack (Frontend + Backend Debugger)

### 2. **Tasks** (Ctrl+Shift+P → Tasks)
- 🚀 Start Full App
- 🎨 Start Frontend Only
- ⚙️ Start Backend Only
- 🏗️ Build Frontend
- 🌱 Seed Database
- 👤 Create Admin (test@test.com)
- 🧪 Run Tests
- 🔍 Type Check
- 🛑 Kill All Node Processes

### 3. **Editor Settings**
- ✅ Auto-format on save (Prettier)
- ✅ ESLint auto-fix
- ✅ TypeScript IntelliSense
- ✅ Tailwind CSS autocomplete
- ✅ Path autocomplete
- ✅ Error highlighting

### 4. **Recommended Extensions**
- Prettier - Code formatter
- ESLint - Linting
- Tailwind CSS IntelliSense
- Auto Rename Tag
- Markdown Mermaid (for diagrams)
- Error Lens (inline errors)
- GitLens (Git enhanced)

---

## 🎮 **Keyboard Shortcuts**

| Action | Shortcut |
|--------|----------|
| **Run/Debug** | `F5` |
| **Stop** | `Shift + F5` |
| **Open Terminal** | `` Ctrl + ` `` |
| **Command Palette** | `Ctrl + Shift + P` |
| **Quick Open File** | `Ctrl + P` |
| **Toggle Sidebar** | `Ctrl + B` |
| **Split Terminal** | `Ctrl + Shift + 5` |
| **New Terminal** | `Ctrl + Shift + ` ` |
| **Search in Files** | `Ctrl + Shift + F` |
| **Format Document** | `Shift + Alt + F` |

---

## 🔧 **Step-by-Step: Run Application Now**

### **Quick Start (1 minute):**

1. ✅ **VS Code should be open** with your project
2. ✅ **Press:** `F5` (or click Run icon in sidebar)
3. ✅ **Select:** "🚀 Run Full App (Frontend + Backend)"
4. ✅ **Click:** Green play button ▶️
5. ✅ **Wait:** ~10 seconds for servers to start
6. ✅ **Open browser:** http://localhost:5173
7. ✅ **Login:** admin@speakready.test / test123

**That's it! Your app is running! 🎉**

---

## 🐛 **Debugging in VS Code**

### Set Breakpoints:

1. Open any `.ts` file in `apps/api/src/`
2. Click in the gutter (left of line numbers) to set a red dot 🔴
3. Press `F5` → Select "🐛 Debug Backend API"
4. Make API call from frontend
5. VS Code pauses at breakpoint
6. Inspect variables, step through code

### Debug Controls:

| Button | Action |
|--------|--------|
| ▶️ Continue | Resume execution |
| ⤵️ Step Over | Execute current line |
| ⬇️ Step Into | Enter function |
| ⬆️ Step Out | Exit function |
| 🔄 Restart | Restart debugger |
| ⏹️ Stop | Stop debugging |

---

## 📂 **VS Code Workspace Structure**

```
VS Code Sidebar:
├─ 📁 apps/
│  ├─ 📁 api/              ← Backend (Express)
│  │  ├─ 📁 src/
│  │  │  ├─ index.ts       ← API entry point
│  │  │  ├─ app.ts         ← Express app
│  │  │  ├─ 📁 modules/    ← API routes
│  │  │  ├─ 📁 ai/         ← AI integrations
│  │  │  └─ 📁 interview/  ← WebSocket
│  │  └─ .env              ← Environment variables
│  │
│  └─ 📁 web/              ← Frontend (React)
│     ├─ 📁 src/
│     │  ├─ main.tsx       ← React entry point
│     │  ├─ App.tsx        ← Root component
│     │  ├─ 📁 pages/      ← Page components
│     │  ├─ 📁 components/ ← UI components
│     │  └─ 📁 lib/        ← Utilities
│     └─ index.html        ← HTML template
│
├─ 📁 .vscode/             ← VS Code configs (NEW!)
│  ├─ launch.json          ← Run configurations
│  ├─ tasks.json           ← Tasks
│  ├─ settings.json        ← Editor settings
│  └─ extensions.json      ← Recommended extensions
│
└─ 📄 Documentation files
```

---

## 🛠️ **Common Tasks in VS Code**

### **Start Development:**
```
Press F5 → "🚀 Run Full App" → Browser opens
```

### **Stop Servers:**
```
Click red square ⏹️ in Debug toolbar
or
Ctrl+Shift+P → "Tasks: Run Task" → "🛑 Kill All Node Processes"
```

### **Restart After Changes:**
```
Backend: Auto-restarts (nodemon/tsx watch)
Frontend: Auto-reloads (Vite HMR)
No manual restart needed!
```

### **Create Admin User:**
```
Press F5 → "👤 Create Admin User"
or
Terminal: cd apps/api && npm run create-admin -- email@test.com Name pass123
```

### **Seed Database:**
```
Press F5 → "🌱 Seed Database"
or
Ctrl+Shift+P → Tasks → "🌱 Seed Database"
```

### **Build for Production:**
```
Ctrl+Shift+P → Tasks → "🏗️ Build Frontend"
```

### **Run Tests:**
```
Ctrl+Shift+P → Tasks → "🧪 Run Tests"
```

---

## 📊 **VS Code Extensions to Install**

When VS Code opens, you'll see a popup: **"This workspace has extension recommendations"**

Click **"Install All"** to get:

1. **Prettier** - Auto-format code
2. **ESLint** - Catch errors
3. **Tailwind CSS IntelliSense** - CSS class autocomplete
4. **Auto Rename Tag** - Rename paired HTML tags
5. **TypeScript** - Better TypeScript support
6. **Markdown Mermaid** - View architecture diagrams
7. **Error Lens** - Inline error messages
8. **GitLens** - Git superpowers

**Or install manually:**
- Open Extensions (Ctrl+Shift+X)
- Search for extension name
- Click "Install"

---

## 🎨 **Color-Coded Terminals**

VS Code will open multiple terminals. Look at the names:

| Terminal Name | Color | Purpose |
|--------------|-------|---------|
| **Frontend (Vite)** | 🟦 Blue | React dev server |
| **Backend (Express)** | 🟩 Green | API server |
| **Task: Build** | 🟨 Yellow | Build tasks |
| **npm** | ⬜ White | npm commands |

---

## 💡 **Pro Tips**

### **1. Split Terminal View**
- Drag terminal tab to split view
- See frontend and backend logs side-by-side

### **2. Quick File Navigation**
- `Ctrl + P` → Type filename → Enter
- Example: `Ctrl + P` → "App.tsx" → Opens instantly

### **3. Search Across All Files**
- `Ctrl + Shift + F`
- Type "useState" → See all React hooks

### **4. Multi-Cursor Editing**
- `Ctrl + D` - Select next occurrence
- `Alt + Click` - Add cursor
- Edit multiple lines at once

### **5. Zen Mode (Focus Mode)**
- `Ctrl + K, Z` - Hide all panels
- `Esc Esc` - Exit Zen mode

---

## 🔍 **Troubleshooting VS Code**

### **Terminal not opening?**
- View → Terminal (`` Ctrl + ` ``)
- Or drag up from bottom

### **F5 does nothing?**
- Click Run icon in left sidebar
- Select configuration from dropdown
- Click green play button

### **Port already in use?**
- Run task: "🛑 Kill All Node Processes"
- Or manually: `taskkill /F /IM node.exe`

### **TypeScript errors everywhere?**
- Ctrl+Shift+P → "TypeScript: Restart TS Server"
- Wait a few seconds

### **Prettier not formatting?**
- Install Prettier extension
- Settings → Default Formatter → Prettier
- Settings → Format On Save → ✅

---

## 📸 **Screenshots to Look For**

### **1. Run and Debug Panel:**
```
RUN AND DEBUG
🚀 Run Full App (Frontend + Backend)     ▶️
```

### **2. Terminal Output (Success):**
```
✔ Frontend running: http://localhost:5173
✔ Backend running: http://localhost:4001
✔ Health: {"ok": true}
```

### **3. Status Bar (Bottom):**
```
TypeScript ✓  |  ESLint ✓  |  Prettier ✓  |  Port: 5173, 4001
```

---

## 🎯 **Your First VS Code Session**

### **Step 1: Open Project**
✅ Already done! (code command executed)

### **Step 2: Install Extensions**
1. Look for popup: "Install recommended extensions"
2. Click "Install All"
3. Wait ~1 minute

### **Step 3: Run Application**
1. Press `F5`
2. Select "🚀 Run Full App"
3. Click play button ▶️

### **Step 4: Open Browser**
1. Wait for terminals to say "ready"
2. Open: http://localhost:5173
3. Login: admin@speakready.test / test123

### **Step 5: Make Changes & See Live Updates**
1. Open: `apps/web/src/App.tsx`
2. Change any text
3. Save (`Ctrl + S`)
4. Browser auto-updates! 🔥

---

## 🚀 **You're Ready!**

**VS Code is configured with:**
✅ Run configurations (F5)
✅ Tasks (Ctrl+Shift+P)
✅ Debug support (breakpoints)
✅ Auto-formatting
✅ IntelliSense
✅ Extension recommendations

**Just press F5 and start coding! 🎉**

---

## 📚 **More Resources**

- **VS Code Docs:** https://code.visualstudio.com/docs
- **Project Docs:** See all `.md` files in root
- **Architecture:** `COMPLETE_ARCHITECTURE.md`
- **Credentials:** `PROJECT_CREDENTIALS.md`

---

**Last Updated:** 2026-10-06  
**VS Code Version:** 1.140.0
