# Email Invite System - SplitSmart

## Overview

The email invite system allows group creators to invite new members via email, even if they haven't signed up on SplitSmart yet. When invited members sign up using their email or Google OAuth, they are automatically added to the group.

## How It Works

### 1. **Invite Flow**
```
Group creator adds member by email
    ↓
System checks if user exists
    ↓
If user doesn't exist:
  - Generate unique invite token
  - Create pending invite in database
  - Send invitation email with signup link
    ↓
Invited user receives email
    ↓
User clicks link and signs up
    ↓
User automatically added to group
    ↓
Invite marked as "accepted"
```

### 2. **Email Invitation**

When adding a member by email in the "Add Member" dialog:

```javascript
POST /api/groups/:groupId/members
{
  email: "friend@example.com"
}
```

The system will:
1. Check if user with that email exists
2. If exists: Add them directly to the group
3. If not exists:
   - Generate a unique `invite_token` (32-byte hex string)
   - Create a pending invite with the token
   - Send an HTML email with:
     - Personalized greeting (inviter's name, group name)
     - "Accept Invite & Sign Up" button
     - Signup link: `http://localhost:3000/register?invite={token}`
     - Fallback link for manual copy-paste

### 3. **Signup with Invite Token**

When user clicks the invite link and signs up:

```javascript
POST /api/auth/register
{
  name: "John Doe",
  email: "john@example.com",
  password: "password123",
  inviteToken: "abc123..."  // Passed from invite link
}
```

The system will:
1. Create the user account
2. Validate the invite token matches the email
3. Add user to the group
4. Mark invite as "accepted"

### 4. **Google OAuth with Invites**

Users can also accept invites via Google OAuth by including the token in the auth URL:

```
GET /api/auth/google?invite={token}
  ↓
User authenticates with Google
  ↓
System checks if email matches pending invite
  ↓
User automatically added to group
  ↓
Redirect to dashboard
```

## Setup

### 1. **Configure Email Service**

Update `.env` with your email credentials:

```env
# Gmail (Recommended for development)
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
```

#### For Gmail:
1. Enable 2-Factor Authentication on your Gmail account
2. Go to: https://myaccount.google.com/apppasswords
3. Select "Mail" and "Windows Computer" (or your device)
4. Google will generate a 16-character app password
5. Use this password in `EMAIL_PASSWORD`

#### For Other Email Services:
Update `server/utils/emailService.js` to use your SMTP configuration:

```javascript
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});
```

### 2. **Database Migration**

Run the pending invites migration:

```bash
cd server
PGPASSWORD=your_password psql -h localhost -U postgres -d your_db -f db/pending_invites_schema.sql
```

This creates the `pending_invites` table with:
- `group_id` - Which group the invite is for
- `email` - Invited email address
- `invited_by` - User ID of the inviter
- `invite_token` - Unique token for this invite (32-byte hex)
- `status` - pending/accepted/rejected
- `created_at`, `updated_at` - Timestamps

### 3. **Update Client Signup**

Update the signup form to accept invite tokens from URL query params:

```javascript
// In Register.jsx or Signup component
const params = new URLSearchParams(window.location.search);
const inviteToken = params.get('invite');

// When submitting form
await axios.post('/api/auth/register', {
  name, email, password,
  inviteToken: inviteToken || undefined
});
```

## Response Examples

### Success - User Already Exists
```json
{
  "success": true,
  "message": "Member added",
  "isNew": false
}
```

### Success - Invite Sent
```json
{
  "success": true,
  "message": "Invite email sent to friend@example.com! They'll be added to the group after signing up.",
  "isNew": true,
  "inviteStatus": "pending",
  "emailSent": true
}
```

### Success - Invite Created, Email Failed (Fallback)
```json
{
  "success": true,
  "message": "Invite created for friend@example.com, but email sending failed. Please share the signup link manually.",
  "isNew": true,
  "inviteStatus": "pending",
  "emailSent": false,
  "inviteLink": "http://localhost:3000/register?invite=abc123..."
}
```

### Error - User Already Member
```json
{
  "success": false,
  "message": "User is already a member"
}
```

## Database Schema

```sql
CREATE TABLE pending_invites (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  invited_by INTEGER NOT NULL REFERENCES users(id),
  invite_token VARCHAR(255) UNIQUE,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, email)
);
```

## Features

- ✅ Generate unique invite tokens (32-byte hex strings)
- ✅ Send HTML formatted invitation emails
- ✅ Auto-add users to groups on signup with token
- ✅ Support for Google OAuth with invites
- ✅ Graceful fallback if email sending fails
- ✅ Track invite status (pending/accepted)
- ✅ Prevent duplicate invites to same email

## Security Considerations

1. **Token Security**: Invite tokens are 32-byte (256-bit) random hex strings
2. **Email Verification**: Tokens are validated against the email address at signup
3. **One-Time Use**: Tokens become invalid once invite is accepted
4. **Expiration**: Consider adding token expiration (e.g., 30 days) in future

## Future Enhancements

- [ ] Add token expiration (configurable)
- [ ] Send follow-up reminder emails if invite not accepted
- [ ] Allow users to reject invites
- [ ] Accept/decline invite buttons in email
- [ ] Admin ability to resend invites
- [ ] Bulk invite via CSV
- [ ] Integration with other email services (SendGrid, Mailgun, etc.)

## Troubleshooting

### Emails Not Sending?
1. Check `EMAIL_USER` and `EMAIL_PASSWORD` in `.env`
2. For Gmail: Verify app password is correct (not regular password)
3. Check server logs for specific error messages
4. Test with fallback: Use the manual `inviteLink` to share directly

### User Not Added After Signup?
1. Verify email matches exactly (case-insensitive matching is enabled)
2. Check `pending_invites` table: `SELECT * FROM pending_invites WHERE status = 'accepted';`
3. Verify user is in `group_members` table after signup

### Invite Token Invalid?
1. Ensure invite link wasn't corrupted during email copy-paste
2. Check token still exists in database and status is 'pending'
3. Verify email in URL matches invited email in database

## Related Files

- `/server/utils/emailService.js` - Email sending logic
- `/server/controllers/groupController.js` - Add member (invite) endpoint
- `/server/controllers/authController.js` - Registration with invite token
- `/server/routes/authRoutes.js` - OAuth with invite token support
- `/server/db/pending_invites_schema.sql` - Database migration
- `/server/.env` - Email configuration

