// Temporary user storage using localStorage as JSON database
// This will be replaced with backend API calls

const USERS_KEY = 'ddos_users_db';

// Initialize users database
const initDB = () => {
  const db = localStorage.getItem(USERS_KEY);
  if (!db) {
    localStorage.setItem(USERS_KEY, JSON.stringify({ users: [] }));
  }
};

// Get all users
export const getUsers = () => {
  initDB();
  const db = localStorage.getItem(USERS_KEY);
  return JSON.parse(db).users;
};

// Save users to storage
const saveUsers = (users) => {
  localStorage.setItem(USERS_KEY, JSON.stringify({ users }));
};

// Find user by email
export const findUserByEmail = (email) => {
  const users = getUsers();
  return users.find(user => user.email === email);
};

// Add new user
export const addUser = (userData) => {
  const users = getUsers();
  const newUser = {
    id: Date.now().toString(),
    ...userData,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  saveUsers(users);
  console.log('Updated users database:', users);
  return newUser;
};

// Session management (still uses sessionStorage for active session)
export const setCurrentSession = (userData) => {
  const session = {
    id: userData.id,
    email: userData.email,
    name: userData.name,
    loggedIn: true,
    loginTime: new Date().toISOString()
  };
  sessionStorage.setItem('currentUser', JSON.stringify(session));
  return session;
};

export const getCurrentSession = () => {
  const session = sessionStorage.getItem('currentUser');
  return session ? JSON.parse(session) : null;
};

export const clearCurrentSession = () => {
  sessionStorage.removeItem('currentUser');
};

export const isAuthenticated = () => {
  return getCurrentSession() !== null;
};
