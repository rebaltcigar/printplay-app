import { createTheme } from '@mui/material/styles';

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#d10000', // Red Primary
        },
        background: {
            default: '#000000', // Pure Black Background
            paper: '#0a0a0a',   // Off-Black Panels
        },
        text: {
            primary: '#ffffff',
            secondary: '#e0e0e0',
        },
        divider: '#333333',
    },
    typography: {
        fontFamily: "'Inter', sans-serif",
    },
    components: {
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none', // Remove default MUI gradients
                },
            },
        },
        MuiAppBar: {
            styleOverrides: {
                root: {
                    backgroundColor: '#0a0a0a',
                    backgroundImage: 'none',
                    borderBottom: '1px solid #333333',
                }
            }
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #333333',
                }
            }
        }
    },
});

export default darkTheme;
