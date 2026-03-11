import React from "react";
import { Box, LinearProgress } from "@mui/material";

export default function LoadingScreen({ message = "Loading...", overlay = false }) {
    const sxProps = {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        width: "100%",
        bgcolor: "background.default",
        p: 4,
        zIndex: overlay ? 9999 : "auto",
        transition: 'all 0.3s ease',
        ...(overlay && {
            position: 'fixed',
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
            <style>{`
                @keyframes ppTextShimmer {
                    0%   { background-position: 100% center; }
                    100% { background-position: -100% center; }
                }
                .pp-shimmer-text {
                    display: inline-block;
                    background: linear-gradient(
                        90deg,
                        rgba(255,255,255,0.22) 0%,
                        rgba(255,255,255,0.80) 45%,
                        rgba(255,255,255,0.22) 90%
                    );
                    background-size: 250% 100%;
                    -webkit-background-clip: text;
                    background-clip: text;
                    -webkit-text-fill-color: transparent;
                    color: transparent;
                    animation: ppTextShimmer 2.2s linear infinite;
                    font-family: inherit;
                    font-size: 0.875rem;
                    font-weight: 500;
                    letter-spacing: 0.5px;
                    margin: 0;
                    padding: 0;
                    margin-top: 14px;
                }
            `}</style>
            <Box sx={{ width: '100%', maxWidth: 300, textAlign: 'center' }}>
                <LinearProgress
                    variant="indeterminate"
                    sx={{
                        height: 6,
                        borderRadius: 3,
                        bgcolor: 'rgba(255,255,255,0.1)',
                        '& .MuiLinearProgress-bar': {
                            borderRadius: 3,
                            boxShadow: (theme) => `0 0 10px ${theme.palette.primary.main}`
                        }
                    }}
                />
                <p className="pp-shimmer-text">{message}</p>
            </Box>
        </Box>
    );
}
