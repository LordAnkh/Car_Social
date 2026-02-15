import React from "react";
import { Routes, Route } from 'react-router-dom';
import Homepage from "./pages/Home";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import MapBox from "./pages/MapBox";

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
</Routes>
</AuthProvider>
)
 }