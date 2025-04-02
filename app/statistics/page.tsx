"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  getAllQuestionErrors,
  getAllWordErrors,
  clearAllStatistics,
  isIndexedDBAvailable,
  checkDatabaseInitialized,
  initDatabase,
} from "../utils/statisticsDB";
import {
  Typography,
  Button,
  Table,
  Tabs,
  Space,
  Card,
  Tag,
  Row,
  Col,
  Spin,
  Empty,
  Modal,
  Statistic,
  Badge,
  Alert,
  App,
} from "antd";
import {
  DeleteOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  TranslationOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;
// 不再从Modal导入confirm
// const { confirm } = Modal;

export default function StatisticsPage() {
  const [questionErrors, setQuestionErrors] = useState<any[]>([]);
  const [wordErrors, setWordErrors] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>("questions");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isMounted = useRef(true); // 添加一个引用来跟踪组件是否已卸载
  // 添加更新计数器，用于强制组件重新渲染
  const [updateCounter, setUpdateCounter] = useState(0);
  const forceUpdate = () => setUpdateCounter((prev) => prev + 1);

  // 使用App中的Modal方法
  const { modal } = App.useApp();

  // 在组件卸载时设置isMounted为false
  useEffect(() => {
    // 确保组件挂载时将isMounted设置为true
    isMounted.current = true;
    console.log("组件挂载，设置isMounted=true");

    return () => {
      console.log("组件卸载，设置isMounted=false");
      isMounted.current = false;
    };
  }, []);

  // 加载统计数据
  const loadStatistics = useCallback(async () => {
    // 每次加载都生成一个唯一ID，便于跟踪
    const requestId = Math.random().toString(36).substring(2, 10);
    console.log(`[${requestId}] 开始加载统计数据...`);

    try {
      setIsLoading(true);
      setLoadError(null);

      // 检查IndexedDB是否可用
      if (!isIndexedDBAvailable()) {
        console.error(`[${requestId}] IndexedDB不可用`);
        throw new Error("您的浏览器不支持IndexedDB，无法加载统计数据");
      }

      // 检查数据库是否已初始化
      const isInitialized = await checkDatabaseInitialized();
      if (!isInitialized) {
        console.log(`[${requestId}] 数据库未初始化，尝试初始化...`);
        const initSuccess = await initDatabase();
        if (!initSuccess) {
          throw new Error("数据库初始化失败，请刷新页面重试");
        }
        console.log(`[${requestId}] 数据库初始化成功`);
      }

      // 获取题目错误数据
      console.log(`[${requestId}] 正在获取题目错误...`);
      const questionErrors = await getAllQuestionErrors();
      console.log(
        `[${requestId}] 题目错误数据获取成功: ${questionErrors.length}`
      );

      // 获取单词错误数据
      console.log(`[${requestId}] 正在获取单词错误...`);
      const wordErrors = await getAllWordErrors();
      console.log(`[${requestId}] 单词错误数据获取成功: ${wordErrors.length}`);

      // 更新状态 - 删除isMounted检查，确保状态始终更新
      setQuestionErrors(questionErrors);
      setWordErrors(wordErrors);
      setIsLoading(false);
      forceUpdate(); // 强制更新以确保UI刷新
      console.log(`[${requestId}] 数据加载完成，已设置isLoading=false`);
    } catch (error) {
      console.error(`[${requestId}] 加载数据出错:`, error);
      // 添加更详细的错误信息
      if (error instanceof Error) {
        console.error(`[${requestId}] 错误信息:`, error.message);
        console.error(`[${requestId}] 错误堆栈:`, error.stack);
      }
      // 始终更新错误状态，不检查isMounted
      setLoadError("加载统计数据失败");
      setIsLoading(false);
      forceUpdate(); // 强制更新UI
    }
  }, []);

  // 加载统计数据
  useEffect(() => {
    loadStatistics();
  }, [loadStatistics]);

  // 格式化日期时间
  const formatDateTime = (isoDate: string) => {
    const date = new Date(isoDate);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 处理清除数据
  const handleClearData = () => {
    modal.confirm({
      title: "确定要清除所有统计数据吗？",
      icon: <ExclamationCircleOutlined />,
      content: "此操作不可撤销，清除后数据将无法恢复。",
      okText: "确认清除",
      okType: "danger",
      cancelText: "取消",
      async onOk() {
        try {
          await clearAllStatistics();
          // 仅在组件仍然挂载时更新状态
          if (isMounted.current) {
            setQuestionErrors([]);
            setWordErrors([]);
          }
        } catch (error) {
          console.error("清除数据失败:", error);
          // 仅在组件仍然挂载时显示错误消息
          if (isMounted.current) {
            modal.error({
              title: "操作失败",
              content: "清除数据失败，请稍后再试",
            });
          }
        }
      },
    });
  };

  // 题目错误表格列定义
  const questionColumns = [
    {
      title: "题号",
      dataIndex: "id",
      key: "id",
      render: (id: number) => (
        <Badge count={id} style={{ backgroundColor: "#1890ff" }} />
      ),
      width: 80,
    },
    {
      title: "句子内容",
      dataIndex: "text",
      key: "text",
      ellipsis: true,
    },
    {
      title: "错误次数",
      dataIndex: "count",
      key: "count",
      render: (count: number) => <Tag color="error">{count} 次</Tag>,
      width: 100,
      sorter: (a: any, b: any) => a.count - b.count,
    },
    {
      title: "最近错误时间",
      dataIndex: "lastErrorTime",
      key: "lastErrorTime",
      render: (time: string) =>
        time ? (
          <Space>
            <ClockCircleOutlined style={{ fontSize: "12px" }} />
            {formatDateTime(time)}
          </Space>
        ) : null,
      width: 180,
      sorter: (a: any, b: any) =>
        new Date(a.lastErrorTime || 0).getTime() -
        new Date(b.lastErrorTime || 0).getTime(),
    },
  ];

  // 单词错误表格列定义
  const wordColumns = [
    {
      title: "单词",
      dataIndex: "word",
      key: "word",
      render: (word: string) => <Tag color="processing">{word}</Tag>,
      width: 150,
    },
    {
      title: "错误次数",
      dataIndex: "count",
      key: "count",
      render: (count: number) => <Tag color="error">{count} 次</Tag>,
      width: 100,
      sorter: (a: any, b: any) => a.count - b.count,
    },
    {
      title: "最近错误时间",
      dataIndex: "lastErrorTime",
      key: "lastErrorTime",
      render: (time: string) =>
        time ? (
          <Space>
            <ClockCircleOutlined style={{ fontSize: "12px" }} />
            {formatDateTime(time)}
          </Space>
        ) : null,
      sorter: (a: any, b: any) =>
        new Date(a.lastErrorTime || 0).getTime() -
        new Date(b.lastErrorTime || 0).getTime(),
    },
  ];

  // 渲染表格时使用React.memo来优化性能
  const StatisticsTable = ({ dataSource, columns, rowKey }: any) => {
    return (
      <Table
        dataSource={dataSource}
        columns={columns}
        rowKey={rowKey}
        pagination={{
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条记录`,
          defaultPageSize: 10,
        }}
        scroll={{ x: "max-content" }}
        // 添加关键的性能优化属性
        virtual={false}
        sticky={true}
      />
    );
  };

  // 缓存表格组件实例
  const QuestionTable = () => (
    <StatisticsTable
      dataSource={questionErrors}
      columns={questionColumns}
      rowKey="id"
    />
  );

  const WordTable = () => (
    <StatisticsTable
      dataSource={wordErrors}
      columns={wordColumns}
      rowKey="word"
    />
  );

  // 定义 Tabs 的 items 配置
  const tabItems = useMemo(
    () => [
      {
        key: "questions",
        label: (
          <span>
            <FileTextOutlined /> 题目错误统计
          </span>
        ),
        children: (
          <>
            {isLoading ? (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <Spin size="large" />
                <p style={{ marginTop: 16 }}>加载中...</p>
              </div>
            ) : loadError ? (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <Alert
                  message="加载失败"
                  description={loadError}
                  type="error"
                  showIcon
                />
                <Button
                  type="primary"
                  style={{ marginTop: 16 }}
                  onClick={() => {
                    setIsLoading(true);
                    setLoadError(null);
                    loadStatistics();
                  }}
                >
                  重试
                </Button>
              </div>
            ) : questionErrors.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <Text>还没有题目错误记录</Text>
                    <br />
                    <Text type="secondary">
                      继续练习，这里会显示你的错误统计
                    </Text>
                  </div>
                }
                style={{ margin: "48px 0" }}
              />
            ) : (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={12}>
                    <Statistic
                      title="错误题目总数"
                      value={questionErrors.length}
                      valueStyle={{ color: "#1890ff" }}
                      prefix={<FileTextOutlined />}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="总错误次数"
                      value={questionErrors.reduce(
                        (sum, item) => sum + item.count,
                        0
                      )}
                      valueStyle={{ color: "#ff4d4f" }}
                    />
                  </Col>
                </Row>
                <Alert
                  message="题目错误数据可以帮助你了解哪些句型需要重点练习"
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <QuestionTable />
              </>
            )}
          </>
        ),
      },
      {
        key: "words",
        label: (
          <span>
            <TranslationOutlined /> 单词错误统计
          </span>
        ),
        children: (
          <>
            {isLoading ? (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <Spin size="large" />
                <p style={{ marginTop: 16 }}>加载中...</p>
              </div>
            ) : loadError ? (
              <div style={{ textAlign: "center", padding: "48px 0" }}>
                <Alert
                  message="加载失败"
                  description={loadError}
                  type="error"
                  showIcon
                />
                <Button
                  type="primary"
                  style={{ marginTop: 16 }}
                  onClick={() => {
                    setIsLoading(true);
                    setLoadError(null);
                    loadStatistics();
                  }}
                >
                  重试
                </Button>
              </div>
            ) : wordErrors.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <div>
                    <Text>还没有单词错误记录</Text>
                    <br />
                    <Text type="secondary">
                      继续练习，这里会显示你的拼写错误统计
                    </Text>
                  </div>
                }
                style={{ margin: "48px 0" }}
              />
            ) : (
              <>
                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={12}>
                    <Statistic
                      title="错误单词总数"
                      value={wordErrors.length}
                      valueStyle={{ color: "#722ed1" }}
                      prefix={<TranslationOutlined />}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="总错误次数"
                      value={wordErrors.reduce(
                        (sum, item) => sum + item.count,
                        0
                      )}
                      valueStyle={{ color: "#ff4d4f" }}
                    />
                  </Col>
                </Row>
                <Alert
                  message="单词错误数据可以帮助你发现拼写薄弱点，针对性强化记忆"
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <WordTable />
              </>
            )}
          </>
        ),
      },
    ],
    [isLoading, questionErrors, wordErrors]
  );

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      {console.log(
        `[RENDER] isLoading=${isLoading}, wordErrors=${wordErrors.length}, questionErrors=${questionErrors.length}, updateCounter=${updateCounter}`
      )}
      {loadError && (
        <Alert
          message="加载失败"
          description={loadError}
          type="error"
          showIcon
          action={
            <Button
              type="primary"
              danger
              onClick={() => {
                loadStatistics();
              }}
            >
              重试
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      <Card variant="borderless" className="shadow-md">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          tabBarExtraContent={
            ((activeTab === "questions" && questionErrors.length > 0) ||
              (activeTab === "words" && wordErrors.length > 0)) && (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleClearData}
              >
                清除所有数据
              </Button>
            )
          }
          destroyInactiveTabPane={true}
        />
      </Card>

      <div
        style={{ textAlign: "center", marginTop: "24px", padding: "12px 0" }}
      >
        <Space>
          <InfoCircleOutlined />
          <Text type="secondary">
            统计数据存储在浏览器本地，清除浏览器数据可能会导致统计信息丢失
          </Text>
        </Space>
      </div>
    </div>
  );
}
