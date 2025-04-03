"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Layout, Typography, Menu } from "antd";
import {
  SoundOutlined,
  BarChartOutlined,
  SettingOutlined,
} from "@ant-design/icons";

const { Header } = Layout;
const { Title } = Typography;

export default function HeaderNav() {
  const pathname = usePathname();

  // 根据当前路径确定哪个菜单项应该高亮
  const getSelectedKey = () => {
    if (pathname === "/") return "practice";
    if (pathname === "/statistics") return "statistics";
    if (pathname === "/settings") return "settings";
    return "";
  };

  // 菜单项配置
  const menuItems = [
    {
      key: "practice",
      icon: <SoundOutlined />,
      label: <Link href="/">听写练习</Link>,
    },
    {
      key: "statistics",
      icon: <BarChartOutlined />,
      label: <Link href="/statistics">错误统计</Link>,
    },
    {
      key: "settings",
      icon: <SettingOutlined />,
      label: <Link href="/settings">设置</Link>,
    },
  ];

  return (
    <Header
      style={{
        padding: "0 24px",
        background: "linear-gradient(to right, #1890ff, #1677ff)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center" }}>
        <Title level={4} style={{ color: "white", margin: "0 24px 0 0" }}>
          英语听写练习系统
        </Title>
      </div>
      <Menu
        mode="horizontal"
        selectedKeys={[getSelectedKey()]}
        items={menuItems}
        style={{
          background: "transparent",
          borderBottom: "none",
          flex: 1,
          justifyContent: "flex-end",
        }}
        theme="dark"
      />
    </Header>
  );
}
