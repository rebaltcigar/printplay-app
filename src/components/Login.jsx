import React, { useState } from 'react';
import { Box, Card, TextField, Select, MenuItem, Button, FormControl, InputLabel, IconButton, InputAdornment, Dialog, DialogTitle, DialogContent, DialogActions, Stack } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

function Login({ onLogin, onAdminLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shift, setShift] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!shift) {
      alert("Please select a shift period.");
      return;
    }
    onLogin(email, password, shift);
  };

  const handleAdminSubmit = (event) => {
    event.preventDefault();
    onAdminLogin(email, password);
    setAdminLoginOpen(false);
  };

  const handleClickShowPassword = () => setShowPassword((show) => !show);
  const handleMouseDownPassword = (event) => { event.preventDefault(); };

  return (
    <>
      <Card sx={{ padding: 4, width: '100%', maxWidth: 400 }}>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
            <img src="/logo.png" alt="Print+Play Logo" style={{ width: '150px' }} />
          </Box>
          <TextField label="Email" variant="outlined" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextField 
            label="Password" 
            variant="outlined" 
            type={showPassword ? 'text' : 'password'} 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            required 
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton aria-label="toggle password visibility" onClick={handleClickShowPassword} onMouseDown={handleMouseDownPassword} edge="end" color="default" sx={{ opacity: 0.7 }}>
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
          <FormControl fullWidth required>
            <InputLabel>Shift Period</InputLabel>
            <Select value={shift} label="Shift Period" onChange={(e) => setShift(e.target.value)}>
              <MenuItem value="Morning">Morning</MenuItem>
              <MenuItem value="Afternoon">Afternoon</MenuItem>
              <MenuItem value="Evening">Evening</MenuItem>
            </Select>
          </FormControl>
          <Button variant="contained" type="submit" sx={{ mt: 2 }}>Start Shift</Button>
          <Button variant="text" size="small" sx={{ mt: 1 }} onClick={() => setAdminLoginOpen(true)}>Login as Super Admin</Button>
        </Box>
      </Card>

      <Dialog open={adminLoginOpen} onClose={() => setAdminLoginOpen(false)}>
        <DialogTitle>Super Admin Login</DialogTitle>
        <Box component="form" onSubmit={handleAdminSubmit}>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField label="Admin Email" variant="outlined" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              <TextField label="Password" type="password" variant="outlined" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAdminLoginOpen(false)}>Cancel</Button>
            <Button type="submit">Login</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
}

export default Login;