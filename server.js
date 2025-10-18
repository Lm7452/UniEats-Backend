// server.js (Complete Version for Debugging)

const express = require('express');
const dotenv = require('dotenv');
const passport = require('passport');
const session = require('express-session');
const bodyParser = require('body-parser');
const OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
const connectDB = require('./db');

// --- 1. INITIAL SETUP ---
// Load environment variables from .env file FIRST
dotenv.config();

// Connect to the database (Temporarily disabled for auth testing)
// connectDB();

const app = express();
const PORT = process.env.PORT || 5000;


// --- 2. MIDDLEWARE SETUP ---
// Body parser middleware to handle form submissions
app.use(bodyParser.urlencoded({ extended: true }));

// Session middleware - required for Passport to maintain a login session
app.use(session({
  secret: process.env.SESSION_SECRET || 'a-default-secret-for-dev', // Best practice: use an environment variable
  resave: false,
  saveUninitialized: true,
}));

// Initialize Passport and have it use the session
app.use(passport.initialize());
app.use(passport.session());


// --- 3. PASSPORT STRATEGY CONFIGURATION ---
// Create a config object first for easy logging
const oidcConfig = {
    identityMetadata: `https://login.microsoftonline.com/${process.env.TENANT_ID}/v2.0/.well-known/openid-configuration`,
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    responseType: 'code id_token',
    responseMode: 'form_post',
    redirectUrl: process.env.REDIRECT_URL || 'http://localhost:5000/auth/openid/return',
    allowHttpForRedirectUrl: true, // Necessary for local testing on http

    scope: ['profile', 'email'],
    
    passReqToCallback: false
};

// DEBUG LOG: Print the configuration being used
console.log('--- Initializing Passport with this OIDC Config ---');
console.log(oidcConfig);

// Define the OIDC strategy
passport.use(new OIDCStrategy(oidcConfig,
  (iss, sub, profile, done) => {
    // --- DEBUG LOGS ---
    console.log('--- OIDC CALLBACK TRIGGERED ---');
    console.log('Authentication with Microsoft was successful.');
    console.log('Received Profile:', profile);
    // --- END DEBUG LINES ---

    // In the future, you will find or create a user in your database here.
    // For now, we just pass the raw profile to the next step.
    return done(null, profile);
  }
));

passport.serializeUser((user, done) => {
  // Use user.sub as the unique identifier
  done(null, user.sub); 
});
passport.deserializeUser((sub, done) => {
  // Pass the user object back. In the future you'll find the user by their 'sub' in the database.
  done(null, { sub: sub });
});

// --- 4. ROUTES ---
// This route starts the login process
app.get('/login',
  passport.authenticate('azuread-openidconnect', { failureRedirect: '/login-failed' })
);

// This is the "Redirect URI" you configured in Azure. Microsoft sends the user back here after they log in.
app.get('/auth/openid/return',
  passport.authenticate('azuread-openidconnect', { failureRedirect: '/login-failed' }),
  (req, res) => {
    // Authentication was successful. Redirect to the FRONTEND dashboard.
    es.redirect(`${process.env.FRONTEND_URL}/dashboard`);
  }
);

// This route ends the login session
app.get('/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    req.session.destroy(() => {
    res.redirect(process.env.FRONTEND_URL);
    });
  });
});

// A simple protected route to test if the user is logged in
app.get('/profile', (req, res) => {
    if (req.isAuthenticated()) { // isAuthenticated() is a Passport function
        res.send(`<h1>Hello!</h1><p>You are logged in.</p><a href="/logout">Logout</a>`);
    } else {
        res.redirect('/login-failed');
    }
});

// A route to handle login failures
app.get('/login-failed', (req, res) => {
  res.status(401).send('<h1>Login Failed</h1><p>There was an error authenticating. Please check your terminal logs and Azure configuration.</p><a href="/">Home</a>');
});

// The root route with a login link
app.get('/', (req, res) => {
  res.send('<h1>Welcome to UniEats</h1><a href="/login">Login with Princeton</a>');
});


// --- 5. SERVER START ---
// Start the server
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);

});

