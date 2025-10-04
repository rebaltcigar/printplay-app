import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, Dialog, DialogTitle, DialogContent, TextField, Stack, DialogActions, TableContainer, Paper, Table, TableHead, TableRow, TableCell, TableBody, Select, MenuItem, FormControl, InputLabel, IconButton } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [openAddUserDialog, setOpenAddUserDialog] = useState(false);
  const [openEditUserDialog, setOpenEditUserDialog] = useState(false);
  const [userToEdit, setUserToEdit] = useState(null);
  const [newUser, setNewUser] = useState({ email: '', password: '', fullName: '', role: 'staff' });
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleOpenEditDialog = (user) => {
    setUserToEdit(user);
    setOpenEditUserDialog(true);
  };

  const handleCloseEditDialog = () => {
    setUserToEdit(null);
    setOpenEditUserDialog(false);
  };

  const handleEditInputChange = (e) => {
    setUserToEdit({ ...userToEdit, [e.target.name]: e.target.value });
  };

  const handleUpdateUser = async (event) => {
    event.preventDefault();
    if (!userToEdit) return;

    try {
      const userDocRef = doc(db, "users", userToEdit.id);
      await updateDoc(userDocRef, {
        fullName: userToEdit.fullName,
        role: userToEdit.role,
      });
      handleCloseEditDialog();
    } catch (error) {
      console.error("Error updating user:", error);
      alert("Failed to update user.");
    }
  };

  const handleInputChange = (e) => {
    setNewUser({ ...newUser, [e.target.name]: e.target.value });
  };

  const handleAddNewUser = async (event) => {
    event.preventDefault();
    setError('');
    if (!newUser.email || !newUser.password || !newUser.fullName) {
      setError("All fields are required.");
      return;
    }

    try {
      const functions = getFunctions();
      const createNewUser = httpsCallable(functions, 'createNewUser');
      await createNewUser(newUser);
      
      setOpenAddUserDialog(false);
      setNewUser({ email: '', password: '', fullName: '', role: 'staff' });
    } catch (error) {
      console.error("Error creating new user via function:", error);
      setError(error.message);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">User Accounts</Typography>
        <Button variant="contained" onClick={() => setOpenAddUserDialog(true)}>Add New User</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Full Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.fullName}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell sx={{ textTransform: 'capitalize' }}>{user.role}</TableCell>
                <TableCell align="right">
                  <IconButton onClick={() => handleOpenEditDialog(user)}>
                    <EditIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add User Dialog */}
      <Dialog open={openAddUserDialog} onClose={() => setOpenAddUserDialog(false)}>
        <DialogTitle>Add a New User</DialogTitle>
        <Box component="form" onSubmit={handleAddNewUser}>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1, minWidth: 400 }}>
              <TextField name="fullName" label="Full Name" value={newUser.fullName} onChange={handleInputChange} required autoFocus/>
              <TextField name="email" label="Email Address" type="email" value={newUser.email} onChange={handleInputChange} required />
              <TextField name="password" label="Password" type="password" value={newUser.password} onChange={handleInputChange} required />
              <FormControl fullWidth>
                <InputLabel>Role</InputLabel>
                <Select name="role" value={newUser.role} label="Role" onChange={handleInputChange}>
                  <MenuItem value="staff">Staff</MenuItem>
                  <MenuItem value="superadmin">Super Admin</MenuItem>
                </Select>
              </FormControl>
              {error && <Typography color="error">{error}</Typography>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenAddUserDialog(false)}>Cancel</Button>
            <Button type="submit">Create User</Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={openEditUserDialog} onClose={handleCloseEditDialog}>
        <DialogTitle>Edit User</DialogTitle>
        {userToEdit && (
          <Box component="form" onSubmit={handleUpdateUser}>
            <DialogContent>
              <Stack spacing={2} sx={{ pt: 1, minWidth: 400 }}>
                <TextField name="email" label="Email Address" value={userToEdit.email} disabled />
                <TextField name="fullName" label="Full Name" value={userToEdit.fullName} onChange={handleEditInputChange} required autoFocus />
                <FormControl fullWidth>
                  <InputLabel>Role</InputLabel>
                  <Select name="role" value={userToEdit.role} label="Role" onChange={handleEditInputChange}>
                    <MenuItem value="staff">Staff</MenuItem>
                    <MenuItem value="superadmin">Super Admin</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseEditDialog}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </DialogActions>
          </Box>
        )}
      </Dialog>
    </Box>
  );
}

export default UserManagement;