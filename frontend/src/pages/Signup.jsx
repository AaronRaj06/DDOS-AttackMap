import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { findUserByEmail, addUser } from '../utils/auth';
import './Auth.css';

function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match!');
      return;
    }
    
    // Check if user already exists
    const existingUser = findUserByEmail(formData.email);
    if (existingUser) {
      alert('User already exists! Please login.');
      navigate('/login');
      return;
    }
    
    // Add new user to JSON storage
    const userData = {
      name: formData.name,
      email: formData.email,
      password: formData.password // In production, this would be hashed on backend
    };
    
    addUser(userData);
    console.log('Signup data:', formData);
    
    // Show success message and redirect to login
    alert('Account created successfully! Please login.');
    navigate('/login');
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Global DoS Attack Map</h1>
          <h2>Sign Up</h2>
          <p>Create your account to access the dashboard.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Full Name</label>
            <input
              type="text"
              id="name"
              name="name"
              placeholder="Enter your full name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="Create a password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              placeholder="Confirm your password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-options">
            <label className="remember-me">
              <input type="checkbox" required />
              <span>I agree to the Terms & Conditions</span>
            </label>
          </div>

          <button type="submit" className="auth-button">
            Sign Up
          </button>
        </form>

        <div className="auth-footer">
          <p>Already have an account? <Link to="/login">Login</Link></p>
        </div>
      </div>
    </div>
  );
}

export default Signup;
