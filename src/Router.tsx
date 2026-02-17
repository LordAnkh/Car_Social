import React from "react";
import { Routes, Route, useLocation } from 'react-router-dom';
import Homepage from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import MapBox from "./pages/MapBox";
import Friends from "./pages/Friends";
import Landing from "./pages/Landing";
import BottomNav from "./components/BottomNav";
import { AuthProvider } from "./context/AuthContext";
//import InformationCenter from "./Tracker.js";
//import Financial from "./Financial.js";

const NAV_PAGES = ['/home', '/friends', '/mapbox'];

function AppRoutes() {
  const location = useLocation();
  const showNav = NAV_PAGES.includes(location.pathname);

  return (
    <>
      <Routes>
        <Route path="/" element={<Login/>} />
        <Route path="/home" element={<Homepage/>} />
        <Route path="/signup" element={<Signup/>} />
        <Route path="/mapbox" element={<MapBox/>} />
        <Route path="/friends" element={<Friends/>} />
        <Route path="/landing" element={<Landing/>} />
      </Routes>
      {showNav && <BottomNav />}
    </>
  );
}

export default function Router(){
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}