import React, { useState, useEffect } from "react";
import UserIntake from "./components/UserIntake.jsx";
import ServiceDesk from "./components/ServiceDesk.jsx";
import { initLang, t } from "./i18n.js";

export default function App() {
  const [role, setRole] = useState("user");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initLang()
      .catch((err) => console.warn("Config loading failed, using default language:", err))
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-title">{t("appTitle")}</span>
          <span className="brand-sub">{t("appSub")}</span>
        </div>
        <div className="role-switch">
          <button 
            className={role === "user" ? "on" : ""} 
            onClick={() => setRole("user")}
          >
            {t("roleUser")}
          </button>
          <button 
            className={role === "desk" ? "on" : ""} 
            onClick={() => setRole("desk")}
          >
            {t("roleDesk")}
          </button>
        </div>
        <div className="env">DEMO</div>
      </header>

      {role === "user" ? (
        <div className="single">
          <section className="pane">
            <div className="pane-h">
              <span className="dot user" /> {t("paneUser")}
            </div>
            <UserIntake />
          </section>
        </div>
      ) : (
        <ServiceDesk />
      )}
    </div>
  );
}
