import React from "react";
import { Box, LinearProgress, Typography } from "@mui/material";

export default function AdminLoading({ message = "Loading data...", overlay = false }) {
    // Common style for both overlay and in-place
    const sxProps = {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%", // Takes full height of container
        width: "100%",
        bgcolor: "rgba(0, 0, 0, 0.04)", // Subtle gray background
        p: 4,
        zIndex: overlay ? 9999 : "auto",
        ...(overlay && {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: 'rgba(255, 255, 255, 0.7)' // Lighter for overlay to see behind slightly? Or user said "gray background with opacity"
        })
    };

    // User asked for gray background with opacity.
    // If overlay, maybe darker? 
    // "gray background with opacity" implies a backdrop.
    // For standard view, just a gray box.

    return (
        <Box sx={sxProps}>
            <Box sx={{ width: '100%', maxWidth: 300, textAlign: 'center' }}>
                <LinearProgress sx={{ height: 6, borderRadius: 3 }} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontWeight: 500 }}>
                    {message}
                </Typography>
            </Box>
        </Box>
    );
}
