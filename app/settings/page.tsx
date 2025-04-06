"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  Typography,
  Space,
  Button,
  Row,
  Col,
  Divider,
  message,
  Modal,
  Form,
  Input,
  Upload,
  Alert,
  App,
} from "antd";
import {
  UploadOutlined,
  DownloadOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import {
  saveShortcutsSettings,
  getShortcutsSettings,
  resetShortcutsSettings,
  ShortcutsSettings as DBShortcutsSettings,
  DEFAULT_SHORTCUTS as DB_DEFAULT_SHORTCUTS,
  exportAllData,
  importAllData,
  downloadAsJson,
  clearAllStatistics,
} from "../utils/statisticsDB";

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

// 快捷键配置的接口
interface ShortcutConfig {
  key: string;
  shiftKey: boolean;
  ctrlKey?: boolean; // 添加对Ctrl键的支持
  altKey?: boolean; // 添加对Alt键的支持
  description: string;
}

interface ShortcutsSettings {
  submit: ShortcutConfig;
  playAudio: ShortcutConfig;
  nextQuestion: ShortcutConfig;
  prevQuestion: ShortcutConfig;
  resetQuestion: ShortcutConfig;
}

// 使用导入的默认快捷键配置
const DEFAULT_SHORTCUTS: ShortcutsSettings = DB_DEFAULT_SHORTCUTS;

// 修改导出数据的类型
interface ExportData {
  metadata: {
    exportTime: string;
  };
  data: Record<string, unknown[]>;
}

// 简化版设置页面
export default function SettingsPage() {
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportData, setExportData] = useState<ExportData | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const { message: messageApi, modal } = App.useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form] = Form.useForm();

  // 添加快捷键设置状态
  const [shortcuts, setShortcuts] =
    useState<ShortcutsSettings>(DEFAULT_SHORTCUTS);
  const [recording, setRecording] = useState<string | null>(null);

  // 处理快捷键设置保存
  const handleShortcutsSave = async (
    shortcuts: Omit<DBShortcutsSettings, "id" | "lastUpdateTime">
  ) => {
    try {
      await saveShortcutsSettings(shortcuts);
      messageApi.success("快捷键设置已更新");

      // 触发自定义事件，通知其他组件快捷键已更新
      if (typeof window !== "undefined") {
        const event = new CustomEvent("shortcutsUpdated", {
          detail: shortcuts,
        });
        window.dispatchEvent(event);
        console.log("已触发shortcutsUpdated事件");
      }

      return true;
    } catch (error) {
      console.error("保存快捷键设置失败:", error);
      messageApi.error("保存快捷键设置失败");
      return false;
    }
  };

  // 处理导出数据
  const handleExportData = async () => {
    try {
      setExportLoading(true);
      const data = await exportAllData();
      setExportData(data);
      setExportModalOpen(true);
      setExportLoading(false);
    } catch (error) {
      console.error("导出数据失败:", error);
      messageApi.error("导出数据失败: " + (error as Error).message);
      setExportLoading(false);
    }
  };

  // 处理下载导出的数据
  const handleDownloadExport = () => {
    try {
      if (!exportData) {
        messageApi.error("没有可下载的数据");
        return;
      }

      const filename = `dictation_export_${new Date()
        .toISOString()
        .replace(/:/g, "-")}.json`;
      downloadAsJson(exportData, filename);
      messageApi.success("数据已下载");

      // 关闭弹窗
      setExportModalOpen(false);
    } catch (error) {
      console.error("下载数据失败:", error);
      messageApi.error("下载数据失败: " + (error as Error).message);
    }
  };

  // 修改handleFileSelect的类型
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setImportFile(files[0]);
      setImportError(null);
    }
  };

  // 处理导入数据
  const handleImportData = async () => {
    if (!importFile) {
      setImportError("请选择要导入的数据文件");
      return;
    }

    setImportLoading(true);
    setImportError(null);

    try {
      // 读取文件内容
      const fileContent = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => reject(new Error("读取文件失败"));
        reader.readAsText(importFile);
      });

      // 解析JSON
      const jsonData = JSON.parse(fileContent);

      // 导入数据到IndexedDB
      await importAllData(jsonData);

      messageApi.success("数据导入成功");
      setImportModalOpen(false);
      setImportFile(null);

      // 重置文件输入
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("导入数据失败:", error);
      setImportError("导入数据失败: " + (error as Error).message);
    } finally {
      setImportLoading(false);
    }
  };

  // 打开导入对话框
  const showImportModal = () => {
    setImportFile(null);
    setImportError(null);
    setImportModalOpen(true);
  };

  // 修改useEffect加入shortcutsModalOpen依赖
  useEffect(() => {
    if (shortcutsModalOpen) {
      const loadShortcuts = async () => {
        try {
          const savedShortcuts = await getShortcutsSettings();
          console.log("已从IndexedDB加载快捷键设置:", savedShortcuts);

          // 提取要显示在表单中的属性
          const { /* id 和 lastUpdateTime 未使用 */ ...settings } =
            savedShortcuts;
          setShortcuts(settings as ShortcutsSettings);

          // 设置表单初始值
          form.setFieldsValue({
            submit: formatShortcut(savedShortcuts.submit),
            playAudio: formatShortcut(savedShortcuts.playAudio),
            nextQuestion: formatShortcut(savedShortcuts.nextQuestion),
            prevQuestion: formatShortcut(savedShortcuts.prevQuestion),
            resetQuestion: formatShortcut(savedShortcuts.resetQuestion),
          });
        } catch (error) {
          console.error("加载快捷键设置失败:", error);
          messageApi.error("加载快捷键设置失败");
        }
      };
      loadShortcuts();
    }
  }, [form, messageApi, shortcutsModalOpen]);

  // 格式化快捷键为显示文本
  const formatShortcut = (shortcut: ShortcutConfig): string => {
    let result = "";
    if (shortcut.ctrlKey) result += "Ctrl + ";
    if (shortcut.altKey) result += "Alt + ";
    if (shortcut.shiftKey) result += "Shift + ";
    result += shortcut.key;
    return result;
  };

  // 记录快捷键
  const startRecording = (field: string) => {
    setRecording(field);
    // 提示用户按下键盘
    messageApi.info("请按下键盘快捷键...");

    // 强制将焦点从按钮上移开，防止按钮捕获按键事件
    setTimeout(() => {
      // 将焦点移到body元素
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      document.body.focus();
    }, 100);
  };

  // 处理键盘事件 - 完全重写这部分逻辑
  useEffect(() => {
    if (!recording) return;

    // 定义新的键盘处理函数
    const handleKeyboardEvent = (e: KeyboardEvent) => {
      console.log("键盘事件捕获:", e.key, "修饰键状态:", {
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
      });

      // 停止事件传播和默认行为
      e.preventDefault();
      e.stopPropagation();

      // 忽略单独按下的修饰键
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) {
        return;
      }

      // 生成快捷键文本和配置对象
      let shortcutText = "";
      if (e.ctrlKey) shortcutText += "Ctrl + ";
      if (e.altKey) shortcutText += "Alt + ";
      if (e.shiftKey) shortcutText += "Shift + ";
      shortcutText += e.key;

      // 同时创建配置对象
      const shortcutConfig: ShortcutConfig = {
        key: e.key,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        description:
          shortcuts[recording as keyof typeof shortcuts]?.description || "",
      };

      console.log(
        `设置快捷键 ${recording} 为:`,
        shortcutText,
        "配置对象:",
        shortcutConfig
      );

      // 先更新表单值，确保UI显示正确
      try {
        form.setFieldsValue({ [recording as string]: shortcutText });
        console.log("表单值已更新:", recording, shortcutText);
      } catch (error) {
        console.error("更新表单值失败:", error);
      }

      // 然后更新shortcuts状态，确保保存时使用新设置
      setShortcuts((prev) => {
        const newShortcuts = {
          ...prev,
          [recording as keyof typeof shortcuts]: shortcutConfig,
        };
        console.log("已更新shortcuts状态:", newShortcuts);
        return newShortcuts;
      });

      // 延迟一点以确保状态更新和表单渲染完成
      setTimeout(() => {
        setRecording(null);
        messageApi.success("快捷键设置成功: " + shortcutText);
      }, 300);
    };

    // 添加事件监听，使用 keydown 事件和捕获阶段
    window.addEventListener("keydown", handleKeyboardEvent, {
      capture: true,
    });
    document.body.addEventListener("keydown", handleKeyboardEvent, {
      capture: true,
    });

    // 应该在所有表单输入元素上也添加事件
    const formInputs = document.querySelectorAll("input");
    formInputs.forEach((input) => {
      input.addEventListener("keydown", handleKeyboardEvent, {
        capture: true,
      });
    });

    // 清理函数
    return () => {
      window.removeEventListener("keydown", handleKeyboardEvent, {
        capture: true,
      });
      document.body.removeEventListener("keydown", handleKeyboardEvent, {
        capture: true,
      });

      // 移除输入元素上的监听器
      formInputs.forEach((input) => {
        input.removeEventListener("keydown", handleKeyboardEvent, {
          capture: true,
        });
      });
    };
  }, [recording, messageApi]); // 移除form和shortcuts，添加messageApi

  // 保存设置
  const handleSave = async () => {
    try {
      // 获取表单当前值
      const values = await form.validateFields();
      console.log("表单值:", values);

      // 直接使用状态中的shortcuts，而不是重新解析表单值
      console.log("准备保存的快捷键设置:", shortcuts);

      // 保存快捷键到IndexedDB
      await handleShortcutsSave(shortcuts);

      // 关闭弹窗
      setShortcutsModalOpen(false);
    } catch (error) {
      console.error("保存快捷键设置失败:", error);
      messageApi.error("保存快捷键设置失败");
    }
  };

  // 重置为默认设置
  const handleReset = async () => {
    try {
      await resetShortcutsSettings();
      const defaultSettings = await getShortcutsSettings();

      // 提取要显示在表单中的属性
      const { /* id 和 lastUpdateTime 未使用 */ ...settings } = defaultSettings;
      setShortcuts(settings);

      // 更新表单值
      form.setFieldsValue({
        submit: formatShortcut(defaultSettings.submit),
        playAudio: formatShortcut(defaultSettings.playAudio),
        nextQuestion: formatShortcut(defaultSettings.nextQuestion),
        prevQuestion: formatShortcut(defaultSettings.prevQuestion),
        resetQuestion: formatShortcut(defaultSettings.resetQuestion),
      });

      messageApi.success("已重置为默认快捷键");
    } catch (error) {
      console.error("重置快捷键设置失败:", error);
      messageApi.error("重置快捷键设置失败");
    }
  };

  // 添加清空数据库功能
  const handleClearData = () => {
    // 使用App组件中的modal API
    modal.confirm({
      title: "确定要清空所有数据吗？",
      content:
        "此操作将清除所有错误统计记录和学习进度，不可恢复！建议先导出备份。",
      okText: "确认清空",
      okType: "danger",
      cancelText: "取消",
      async onOk() {
        try {
          await clearAllStatistics();
          messageApi.success("数据已清空");
        } catch (error) {
          console.error("清空数据失败:", error);
          messageApi.error("清空数据失败: " + (error as Error).message);
        }
      },
    });
  };

  // 定义设置内容组件
  const SettingsContent = () => (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Title level={4}>快捷键设置</Title>
        <Paragraph>
          <Text>自定义答题界面的快捷键，使操作更加方便。</Text>
        </Paragraph>
        <Button
          type="primary"
          icon={<SettingOutlined />}
          onClick={() => setShortcutsModalOpen(true)}
        >
          配置快捷键
        </Button>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <Title level={4}>数据备份与恢复</Title>
        <Paragraph>
          <Text>
            导出您的学习数据进行备份，或从之前的备份中恢复数据。数据包括错误统计、学习进度和个人设置。
          </Text>
        </Paragraph>
        <Space>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportData}
            loading={exportLoading}
          >
            导出数据
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={showImportModal}
            loading={importLoading}
          >
            导入数据
          </Button>
        </Space>
      </Card>

      <Card>
        <Title level={4} style={{ color: "#cf1322" }}>
          危险操作
        </Title>
        <Paragraph>
          <Text type="danger">
            清空所有学习统计数据，包括错误记录和学习进度。此操作不可撤销！
          </Text>
        </Paragraph>
        <Button danger onClick={handleClearData}>
          清空数据
        </Button>
      </Card>
    </div>
  );

  return (
    <div style={{ padding: "24px", maxWidth: "800px", margin: "0 auto" }}>
      <Typography.Title level={2}>设置</Typography.Title>
      <Divider />

      <SettingsContent />

      {/* 快捷键设置弹窗 */}
      <Modal
        title="快捷键设置"
        open={shortcutsModalOpen}
        onCancel={() => setShortcutsModalOpen(false)}
        width={600}
        footer={[
          <Button key="reset" onClick={handleReset}>
            重置为默认值
          </Button>,
          <Button key="cancel" onClick={() => setShortcutsModalOpen(false)}>
            取消
          </Button>,
          <Button key="save" type="primary" onClick={handleSave}>
            保存
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <Text>
            自定义快捷键设置。点击&ldquo;记录&rdquo;按钮，然后按下键盘快捷键进行设置。
          </Text>
        </div>

        <Form form={form} layout="vertical">
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Form.Item
                label="提交答案"
                name="submit"
                rules={[{ required: true, message: "请设置快捷键" }]}
              >
                <Input
                  readOnly
                  addonAfter={
                    <Button
                      type="link"
                      size="small"
                      onClick={() => startRecording("submit")}
                      style={{
                        color: recording === "submit" ? "#1890ff" : undefined,
                      }}
                    >
                      {recording === "submit" ? "按下键盘..." : "记录"}
                    </Button>
                  }
                  placeholder="按下快捷键"
                  disabled={recording === "submit"}
                  style={{
                    background: recording === "submit" ? "#e6f7ff" : undefined,
                  }}
                />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item
                label="播放音频"
                name="playAudio"
                rules={[{ required: true, message: "请设置快捷键" }]}
              >
                <Input
                  readOnly
                  addonAfter={
                    <Button
                      type="link"
                      size="small"
                      onClick={() => startRecording("playAudio")}
                      style={{
                        color:
                          recording === "playAudio" ? "#1890ff" : undefined,
                      }}
                    >
                      {recording === "playAudio" ? "按下键盘..." : "记录"}
                    </Button>
                  }
                  placeholder="按下快捷键"
                  disabled={recording === "playAudio"}
                  style={{
                    background:
                      recording === "playAudio" ? "#e6f7ff" : undefined,
                  }}
                />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item
                label="下一题"
                name="nextQuestion"
                rules={[{ required: true, message: "请设置快捷键" }]}
              >
                <Input
                  readOnly
                  addonAfter={
                    <Button
                      type="link"
                      size="small"
                      onClick={() => startRecording("nextQuestion")}
                      style={{
                        color:
                          recording === "nextQuestion" ? "#1890ff" : undefined,
                      }}
                    >
                      {recording === "nextQuestion" ? "按下键盘..." : "记录"}
                    </Button>
                  }
                  placeholder="按下快捷键"
                  disabled={recording === "nextQuestion"}
                  style={{
                    background:
                      recording === "nextQuestion" ? "#e6f7ff" : undefined,
                  }}
                />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item
                label="上一题"
                name="prevQuestion"
                rules={[{ required: true, message: "请设置快捷键" }]}
              >
                <Input
                  readOnly
                  addonAfter={
                    <Button
                      type="link"
                      size="small"
                      onClick={() => startRecording("prevQuestion")}
                      style={{
                        color:
                          recording === "prevQuestion" ? "#1890ff" : undefined,
                      }}
                    >
                      {recording === "prevQuestion" ? "按下键盘..." : "记录"}
                    </Button>
                  }
                  placeholder="按下快捷键"
                  disabled={recording === "prevQuestion"}
                  style={{
                    background:
                      recording === "prevQuestion" ? "#e6f7ff" : undefined,
                  }}
                />
              </Form.Item>
            </Col>

            <Col span={24}>
              <Form.Item
                label="重置当前题目"
                name="resetQuestion"
                rules={[{ required: true, message: "请设置快捷键" }]}
              >
                <Input
                  readOnly
                  addonAfter={
                    <Button
                      type="link"
                      size="small"
                      onClick={() => startRecording("resetQuestion")}
                      style={{
                        color:
                          recording === "resetQuestion" ? "#1890ff" : undefined,
                      }}
                    >
                      {recording === "resetQuestion" ? "按下键盘..." : "记录"}
                    </Button>
                  }
                  placeholder="按下快捷键"
                  disabled={recording === "resetQuestion"}
                  style={{
                    background:
                      recording === "resetQuestion" ? "#e6f7ff" : undefined,
                  }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        <Divider />

        <div>
          <Text type="secondary">
            提示：快捷键设置保存后将立即生效。请避免设置重复的快捷键。
          </Text>
        </div>
      </Modal>

      {/* 导出数据弹窗 */}
      <Modal
        title="导出数据"
        open={exportModalOpen}
        onCancel={() => setExportModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setExportModalOpen(false)}>
            取消
          </Button>,
          <Button
            key="download"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownloadExport}
          >
            下载数据
          </Button>,
        ]}
      >
        {exportData && (
          <>
            <Alert
              message="数据导出成功"
              description="点击下载按钮保存数据文件，您可以在将来导入此数据来恢复学习记录和设置。"
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <div style={{ marginBottom: 16 }}>
              <Text>导出信息：</Text>
              <ul>
                <li>
                  <Text>导出时间：{exportData.metadata.exportTime}</Text>
                </li>
                <li>
                  <Text>
                    导出数据包含：
                    {Object.keys(exportData.data)
                      .map((key) => {
                        const count = Array.isArray(exportData.data[key])
                          ? exportData.data[key].length
                          : 0;
                        return `${key}(${count}条)`;
                      })
                      .join("、")}
                  </Text>
                </li>
              </ul>
            </div>
          </>
        )}
      </Modal>

      {/* 导入数据弹窗 */}
      <Modal
        title="导入数据"
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setImportModalOpen(false)}>
            取消
          </Button>,
          <Button
            key="import"
            type="primary"
            loading={importLoading}
            disabled={!importFile}
            onClick={handleImportData}
          >
            导入
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <Text>
            选择您之前导出的JSON文件，导入后将替换当前的学习记录和设置。
          </Text>
        </div>

        {importError && (
          <Alert
            message="导入失败"
            description={importError}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <div style={{ marginBottom: 16 }}>
          <input
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            ref={fileInputRef}
            style={{ width: "100%" }}
          />
        </div>

        {importFile && (
          <div>
            <Text strong>已选择文件：</Text>
            <Text>{importFile.name}</Text>
            <Text type="secondary">
              {" "}
              ({(importFile.size / 1024).toFixed(2)} KB)
            </Text>
          </div>
        )}
      </Modal>
    </div>
  );
}
