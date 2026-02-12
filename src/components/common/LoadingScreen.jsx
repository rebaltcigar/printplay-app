import React from "react";
import { Box, LinearProgress, Typography } from "@mui/material";

export default function LoadingScreen({ message = "Loading...", overlay = false }) {
    const sxProps = {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        width: "100%",
        bgcolor: "background.default",
        p: 4,
        zIndex: overlay ? 9999 : "auto",
        transition: 'all 0.3s ease',
        ...(overlay && {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(4px)'
        })
    };

    return (
        <Box sx={sxProps}>
            <Box sx={{ width: '100%', maxWidth: 300, textAlign: 'center' }}>
                <LinearProgress
                    sx={{
                        height: 6,
                        borderRadius: 3,
                        bgcolor: 'rgba(255,255,255,0.1)'
                    }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontWeight: 500, letterSpacing: 0.5 }}>
                    {message}
                </Typography>
            </Box>
        </Box>
    );
}
