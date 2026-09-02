import { io } from 'socket.io-client';

const normalizeApiBase = () => {
  const raw = process.env.REACT_APP_API_URL || 'http://localhost:8000';
  return raw.replace(/\/+$/, '').replace(/\/api$/, '');
};

const BASE_URL = normalizeApiBase();

const socket = io(BASE_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Identify to the server on every (re)connect so it can deliver notifications
// targeted at this user (e.g. being added to a group).
socket.on('connect', () => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user && user.id) socket.emit('identify', user.id);
  } catch {
    /* ignore malformed localStorage */
  }
});

export default socket;