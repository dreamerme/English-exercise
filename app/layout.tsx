"use client";
import "./globals.css";
import { ConfigProvider, App as AntdApp, Layout } from "antd";
import zhCN from "antd/locale/zh_CN";
import "@ant-design/v5-patch-for-react-19";
import HeaderNav from "./components/HeaderNav";

const { Content } = Layout;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh">
      <body className="antialiased">
        <ConfigProvider
          locale={zhCN}
          theme={{
            token: {
              colorPrimary: "#1890ff",
              fontFamily:
                "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, 'Helvetica Neue', sans-serif",
            },
          }}
        >
          <AntdApp>
            <Layout className="min-h-screen">
              <HeaderNav />
              <Content>{children}</Content>
            </Layout>
          </AntdApp>
        </ConfigProvider>
      </body>
    </html>
  );
}
