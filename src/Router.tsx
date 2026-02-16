import React from "react";
import { Routes, Route } from 'react-router-dom';
import Homepage from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import MapBox from "./pages/MapBox";
import Friends from "./pages/Friends";
import Landing from "./pages/Landing";
import { AuthProvider } from "./context/AuthContext";
//import InformationCenter from "./Tracker.js";
//import Financial from "./Financial.js";

export default function Router(){
return (
<AuthProvider>
<Routes>
<Route path="/" element={<Login/>} />
      <Route path="/home" element={<Homepage/>} />
      <Route path="/signup" element={<Signup/>} />
      <Route path="/mapbox" element={<MapBox/>} />
      <Route path="/friends" element={<Friends/>} />
       <Route path="/landing" element={<Landing/>} />
</Routes>
</AuthProvider>
)
 }