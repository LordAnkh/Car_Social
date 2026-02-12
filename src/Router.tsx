import React from "react";
import { Routes, Route } from 'react-router-dom';
import Homepage from "./pages/Home/index.tsx";
import Login from "./pages/Login/index.tsx";
import Signup from "./pages/Signup/index.tsx";
import MapBox from "./pages/MapBox/index.tsx";
import CreatePost from "./pages/CreatePost/index.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";
//import InformationCenter from "./Tracker.js";
//import Financial from "./Financial.js";

export default function Router(){
return (
<AuthProvider>
<Routes>
<Route path="/" element={<Login/>} />
      <Route path="/home" element={<Homepage/>} />
      <Route path="/signup" element={<Signup/>} />
      <Route path="/create-trip" element={<CreatePost/>} />
      <Route path="/mapbox" element={<MapBox/>} />
</Routes>
</AuthProvider>
)
 }