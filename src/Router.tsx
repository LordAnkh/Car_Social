import React from "react";
import {Routes,Route} from 'react-router-dom';
import Homepage from "./Home.tsx";
import Login   from "./Login.tsx";
import Signup from "./Signup.tsx";
import CreatePost from "./postcreate.tsx";
import { AuthProvider } from "./AuthContext.tsx";
//import InformationCenter from "./Tracker.js";
//import Financial from "./Financial.js";

export default function Router(){
return (
<AuthProvider>
<Routes>
<Route path="/" element={<Login/>} />
      <Route path="/home" element={<Homepage/>} />
      <Route path="/signup" element={<Signup/>} />
      <Route path="/create-post" element={<CreatePost/>} />
      {/* <Route path="/financial" element={<Financial />} /> */}
</Routes>
</AuthProvider>
)


}