// server.js (Complete Version with Cross-Origin Auth Fix)

const express = require('express');
const dotenv = require('dotenv');
const passport = require('passport');
const session = require('express-session');
const bodyParser = require('body-parser');
const OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
const cors = require('cors');
const db = require('./db');

// --- 1. INITIAL SETUP ---
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- 2. MIDDLEWARE SETUP ---
app.use(bodyParser.urlencoded({ extended: true }));

// CORS - Allow requests from frontend
app.use(cors({
    origin: process.env.FRONTEND_URL,
    credentials: true
}));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'a-default-secret-for-dev',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// --- 3. PASSPORT STRATEGY CONFIGURATION ---
const oidcConfig = {
    identityMetadata: `https://login.microsoftonline.com/${process.env.TENANT_ID}/v2.0/.well-known/openid-configuration`,
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    responseType: 'code id_token',
    responseMode: 'form_post',
    redirectUrl: process.env.REDIRECT_URL || 'http://localhost:5000/auth/openid/return',
    allowHttpForRedirectUrl: true,
    scope: ['profile', 'email'],
    passReqToCallback: false
};

console.log('--- Initializing Passport with this OIDC Config ---');
console.log(oidcConfig);

passport.use(new OIDCStrategy(oidcConfig,
  async (iss, sub, profile, done) => {
    console.log('--- OIDC CALLBACK TRIGGERED ---');
    console.log('Authentication with Microsoft was successful.');
    
    const azureOid = profile.oid;
    const email = profile.upn || profile._json?.email || profile.emails?.[0]?.value;
    const name = profile.displayName || 'UniEats User';

    if (!azureOid || !email) {
       console.error('Azure profile object missing oid or email:', profile);
       return done(new Error('Authentication profile is missing required identifiers.'), null);
    }

    try {
      let userResult = await db.query('SELECT * FROM users WHERE azure_oid = $1', [azureOid]);
      let user = userResult.rows[0];

      if (!user) {
        console.log(`User not found with OID ${azureOid}, creating new user...`);
        const insertResult = await db.query(
          'INSERT INTO users (azure_oid, email, name) VALUES ($1, $2, $3) RETURNING *',
          [azureOid, email, name]
        );
        user = insertResult.rows[0];
        console.log('New user created:', user);
      } else {
        console.log('Existing user found:', user);
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

      return done(null, user);

    } catch (err) {
      console.error('Error during database user lookup/creation:', err);
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id); 
});

passport.deserializeUser(async (id, done) => {
  try {
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = userResult.rows[0];
    done(null, user || false);
  } catch (err) {
    done(err, null);
  }
});

// --- 4. ROUTES ---

// Login route
app.get('/login',
  passport.authenticate('azuread-openidconnect', { failureRedirect: '/login-failed' })
);

// OAuth callback - After successful auth, redirect to frontend with session ID
app.post('/auth/openid/return',
  passport.authenticate('azuread-openidconnect', { failureRedirect: '/login-failed' }),
  (req, res) => {
    console.log('--- SUCCESS! User authenticated ---');
    console.log('Session ID:', req.sessionID);
    console.log('User:', req.user);
    
    // Redirect to frontend with session ID as query parameter
    res.redirect(`${process.env.FRONTEND_URL}/dashboard?session=${req.sessionID}`);
  }
);

// API endpoint to get user data by session ID
app.get('/api/user', (req, res) => {
  console.log('--- /api/user endpoint hit ---');
  console.log('Is authenticated:', req.isAuthenticated());
  console.log('Session ID:', req.sessionID);
  console.log('User:', req.user);
  
  if (req.isAuthenticated()) {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role
      }
    });
  } else {
    console.log('User not authenticated');
    res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
});

// Logout route
app.get('/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    req.session.destroy(() => {
      res.redirect(process.env.FRONTEND_URL);
    });
  });
});

// Profile test route
app.get('/profile', (req, res) => {
    if (req.isAuthenticated()) {
        res.send(`<h1>Hello, ${req.user.name}!</h1><p>You are logged in.</p><a href="/logout">Logout</a>`);
    } else {
        res.redirect('/login-failed');
    }
});

// Login failed route
app.get('/login-failed', (req, res) => {
  res.status(401).send('<h1>Login Failed</h1><p>There was an error authenticating. Please check your terminal logs and Azure configuration.</p><a href="/">Home</a>');
});

// Root route
app.get('/', (req, res) => {
  res.send('<h1>Welcome to UniEats</h1><a href="/login">Login with Princeton</a>');
});

// Test session endpoint
app.get('/test-session', (req, res) => {
  res.json({
    isAuthenticated: req.isAuthenticated(),
    sessionID: req.sessionID,
    user: req.user,
    cookies: req.headers.cookie
  });
});

// --- 5. SERVER START ---
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});