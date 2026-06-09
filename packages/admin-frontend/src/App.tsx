import { App as AntdApp, ConfigProvider, theme } from "antd";
import { useEffect, useState } from "react";
import { AdminLoginScreen } from "./admin/AdminLoginScreen";
import { AdminWorkspace } from "./admin/AdminWorkspace";
import {
  ApiError,
  getAdminAccessToken,
  loadAdminProfile,
  loginAdmin,
  setAdminAccessToken,
  type AdminLoginInput,
  type AdminProfile,
} from "./api";

type AdminSessionState =
  | {
      accessToken: null;
      admin: null;
      status: "guest";
    }
  | {
      accessToken: string;
      admin: null;
      status: "checking";
    }
  | {
      accessToken: string;
      admin: AdminProfile;
      status: "authenticated";
    };

function initialAdminSession(): AdminSessionState {
  const accessToken = getAdminAccessToken();

  if (!accessToken) {
    return {
      accessToken: null,
      admin: null,
      status: "guest",
    };
  }

  return {
    accessToken,
    admin: null,
    status: "checking",
  };
}

export default function App() {
  const [adminSession, setAdminSession] =
    useState<AdminSessionState>(initialAdminSession);

  useEffect(() => {
    if (adminSession.status !== "checking") {
      return;
    }

    let active = true;

    loadAdminProfile()
      .then((admin) => {
        if (!active) {
          return;
        }

        setAdminSession({
          accessToken: adminSession.accessToken,
          admin,
          status: "authenticated",
        });
      })
      .catch(() => {
        setAdminAccessToken(null);

        if (!active) {
          return;
        }

        setAdminSession({
          accessToken: null,
          admin: null,
          status: "guest",
        });
      });

    return () => {
      active = false;
    };
  }, [adminSession]);

  const handleAdminLogin = async (values: AdminLoginInput) => {
    const response = await loginAdmin(values);

    setAdminAccessToken(response.accessToken);
    setAdminSession({
      accessToken: response.accessToken,
      admin: response.admin,
      status: "authenticated",
    });
  };

  const handleAdminLogout = () => {
    setAdminAccessToken(null);
    setAdminSession({
      accessToken: null,
      admin: null,
      status: "guest",
    });
  };

  const handleAdminUpdated = (admin: AdminProfile) => {
    setAdminSession((current) => {
      if (current.status !== "authenticated") {
        return current;
      }

      return {
        ...current,
        admin,
      };
    });
  };

  const handleAdminUnauthorized = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      handleAdminLogout();
      return true;
    }

    return false;
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          borderRadius: 6,
          colorBgLayout: "#f6f7f9",
          colorPrimary: "#b20d2a",
          colorText: "#1f2328",
          fontFamily:
            '"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
      }}
    >
      <AntdApp>
        {adminSession.status === "authenticated" ? (
          <AdminWorkspace
            admin={adminSession.admin}
            onAdminUpdated={handleAdminUpdated}
            onLogout={handleAdminLogout}
            onUnauthorized={handleAdminUnauthorized}
          />
        ) : (
          <AdminLoginScreen
            checking={adminSession.status === "checking"}
            onLogin={handleAdminLogin}
          />
        )}
      </AntdApp>
    </ConfigProvider>
  );
}
