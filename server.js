// server.js (Complete Version for Debugging)

const express = require('express');
const dotenv = require('dotenv');
const passport = require('passport');
const session = require('express-session');
const bodyParser = require('body-parser');
const OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
const cors = require('cors');
const db = require('./db'); // Add this line

// --- 1. INITIAL SETUP ---
// Load environment variables from .env file FIRST
dotenv.config();

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
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));


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
  async (iss, sub, profile, done) => { // Make the function async
    console.log('--- OIDC CALLBACK TRIGGERED ---');
    console.log('Authentication with Microsoft was successful.');
    // Use profile.oid as the unique identifier from Azure AD
    const azureOid = profile.oid;
    // Extract email and name - adjust property names based on your actual profile object logging
    const email = profile.upn || profile._json?.email || profile.emails?.[0]?.value;
    const name = profile.displayName || 'UniEats User';

    if (!azureOid || !email) {
       console.error('Azure profile object missing oid or email:', profile);
       return done(new Error('Authentication profile is missing required identifiers.'), null);
    }

    try {
      // Check if user exists
      let userResult = await db.query('SELECT * FROM users WHERE azure_oid = $1', [azureOid]);
      let user = userResult.rows[0];

      if (!user) {
        // User not found, create a new one
        console.log(`User not found with OID ${azureOid}, creating new user...`);
        const insertResult = await db.query(
          'INSERT INTO users (azure_oid, email, name) VALUES ($1, $2, $3) RETURNING *',
          [azureOid, email, name]
        );
        user = insertResult.rows[0];
        console.log('New user created:', user);
      } else {
        console.log('Existing user found:', user);
        // Optional: Update user info if it changed in Azure AD (e.g., name)
        if (user.name !== name || user.email !== email) {
           console.log('Updating user information...');
           const updateResult = await db.query(
             'UPDATE users SET name = $1, email = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
             [name, email, user.id]
           );
           user = updateResult.rows[0];
           console.log('User updated:', user);
        }
      }

      // Pass the user object from *your database* to Passport
      return done(null, user);

    } catch (err) {
      console.error('Error during database user lookup/creation:', err);
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  // Use user.sub as the unique identifier
  done(null, user.id); 
});
passport.deserializeUser(async (id, done) => {
  try {
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = userResult.rows[0];
    done(null, user || false); // Pass false or null if user not found
  } catch (err) {
    done(err, null);
  }
});

// --- 4. ROUTES ---
// This route starts the login process
app.get('/login',
  passport.authenticate('azuread-openidconnect', { failureRedirect: '/login-failed' })
);

// This is the "Redirect URI" you configured in Azure. Microsoft sends the user back here after they log in.
app.post('/auth/openid/return',
  passport.authenticate('azuread-openidconnect', { failureRedirect: '/login-failed' }),
  (req, res) => {
    console.log(`--- SUCCESS! Redirecting to: ${process.env.FRONTEND_URL}/dashboard ---`);
    // Authentication was successful. Redirect to the FRONTEND dashboard.
    res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
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

app.get('/api/user', (req, res) => {
  console.log('--- /api/user endpoint hit ---');
  console.log('Is authenticated:', req.isAuthenticated());
  console.log('Session:', req.session);
  console.log('User:', req.user);
  
  if (req.isAuthenticated()) {
    // Return user data from the session
    const userData = {
      success: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      }
    };
    console.log('Sending user data:', userData);
    res.json(userData);
  } else {
    console.log('User not authenticated, sending 401');
    res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
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

