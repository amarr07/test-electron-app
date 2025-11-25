import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

/**
 * Application entry point.
 * Initializes Firebase app and renders React app to DOM.
 */
import { getFirebaseApp } from "@/lib/firebase";
getFirebaseApp();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
