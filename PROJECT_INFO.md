# Global DoS Attack Map - Project Documentation

## Project Overview
Real-time cyber-threat visualization platform featuring a 3D WebGL attack map with ML-based attack classification and threat intelligence integrations.

## Tech Stack
- **Frontend**: React + Vite, React Three Fiber, HTML/CSS
- **Backend**: Node.js (handled by teammate)
- **Routing**: React Router DOM

## Current Progress

### ✅ Completed
- [x] Project structure setup (frontend & backend folders)
- [x] React + Vite initialization
- [x] React Router DOM installation
- [x] Login page with styled form
- [x] Signup page with styled form
- [x] Dark theme cyber-security styling
- [x] Responsive design
- [x] Form validation
- [x] Navigation between auth pages

### 🔄 In Progress
- [ ] Three.js globe integration (from GitHub)

### 📋 To Do
- [ ] Dashboard layout
- [ ] 3D globe with attack visualization
- [ ] WebSocket integration for real-time data
- [ ] Attack detail panels
- [ ] Analytics dashboard
- [ ] Export functionality
- [ ] Dark mode toggle
- [ ] User authentication logic
- [ ] Backend API integration

## File Structure

```
ddosmap/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Signup.jsx
│   │   │   └── Auth.css
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── backend/
│   └── (handled by teammate)
└── PROJECT_INFO.md
```

## Running the Project

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The app will run on `http://localhost:5173`

## Features Implemented

### Authentication Pages
- **Login Page** (`/login`)
  - Email & password fields
  - Remember me checkbox
  - Forgot password link
  - Link to signup page
  
- **Signup Page** (`/signup`)
  - Full name, email, password fields
  - Password confirmation
  - Terms & conditions checkbox
  - Link to login page

### Styling
- Cyber-security themed dark UI
- Gradient backgrounds with animated effects
- Red accent colors (#ff0000, #ff6b6b)
- Glassmorphism effects
- Smooth transitions and hover states
- Fully responsive design

## Next Steps
1. Integrate Three.js globe from GitHub repository
2. Create dashboard layout
3. Build attack visualization components
4. Add WebSocket client for real-time data
5. Implement analytics panels

## Notes
- No mock data added (as per requirement)
- Single documentation file (this file)
- Backend to be developed by teammate
