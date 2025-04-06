"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  getAllQuestionErrors,
  getAllWordErrors,
  clearAllStatistics,
  isIndexedDBAvailable,
  checkDatabaseInitialized,
  initDatabase,
  ErrorType,
  ErrorTypeNames,
  ErrorTypeColors,
  WordErrorRecord,
  cleanupDuplicateRecords,
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
  Popover,
  Progress,
  Tooltip,
  Timeline,
  Divider,
} from "antd";
import {
  DeleteOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  TranslationOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  BarChartOutlined,
  HistoryOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  RightOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;
// 不再从Modal导入confirm
// const { confirm } = Modal;

// 定义错误记录的接口
interface ErrorRecord {
  id?: number;
  text?: string;
  word?: string;
  count: number;
  lastErrorTime: string;
  errorTypes?: Record<ErrorType, number>; // 各类型错误统计
  wrongInputs?: Array<{
    input: string;
    time: string;
    errorType: ErrorType;
  }>; // 错误输入历史
  lastAnalysisResult?: {
    correctWords?: string[];
    incorrectWords?: string[];
    missingWords?: string[];
    extraWords?: string[];
    errorDetails?: {
      errorType: ErrorType;
      originalWord?: string;
      userWord?: string;
    }[];
  };
  lastUserInput?: string;
  // 错误历史记录
  errorHistory?: Array<{
    userInput: string;
    analysisResult: {
      correctWords?: string[];
      incorrectWords?: string[];
      missingWords?: string[];
      extraWords?: string[];
      errorDetails?: {
        errorType: ErrorType;
        originalWord?: string;
        userWord?: string;
      }[];
    };
    errorTime: string;
  }>;
}

// 错误类型描述函数
const getErrorTypeDescription = (
  errorType: ErrorType,
  originalWord: string,
  userWord: string
): string => {
  switch (errorType) {
    case ErrorType.SPELLING:
      return `"${originalWord}"的拼写错误。你写成了"${userWord}"，请注意拼写。`;
    case ErrorType.MISSING_WORD:
      return `缺少单词"${originalWord}"。此单词在原句中是必要的。`;
    case ErrorType.EXTRA_WORD:
      return `多余单词"${userWord}"。原句中不需要这个单词。`;
    case ErrorType.WORD_ORDER:
      return `单词"${originalWord}"位置错误。请注意单词在句子中的顺序。`;
    case ErrorType.TENSE:
      return `时态错误。"${originalWord}"的时态用法不正确，你写成了"${userWord}"。`;
    case ErrorType.PART_OF_SPEECH:
      return `词性错误。"${originalWord}"的词性用法不正确，你写成了"${userWord}"。`;
    case ErrorType.SYNONYM:
      return `同义词误用。原句使用"${originalWord}"，而不是"${userWord}"。`;
    case ErrorType.APPROXIMATE:
      return `近似但不等价表达。原句使用"${originalWord}"，而不是"${userWord}"。`;
    case ErrorType.OTHER:
    default:
      return `"${originalWord}"与"${userWord}"不匹配，请检查原句。`;
  }
};

export default function StatisticsPage() {
  const [questionErrors, setQuestionErrors] = useState<ErrorRecord[]>([]);
  const [wordErrors, setWordErrors] = useState<ErrorRecord[]>([]);
  const [activeTab, setActiveTab] = useState<string>("questions");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isMounted = useRef(true); // 添加一个引用来跟踪组件是否已卸载
  // 添加更新计数器，用于强制组件重新渲染
  const [updateCounter, setUpdateCounter] = useState(0);
  // 添加当前筛选的错误类型状态
  const [currentFilter, setCurrentFilter] = useState<ErrorType | null>(null);
  const forceUpdate = () => setUpdateCounter((prev) => prev + 1);

  // 新增状态 - 选中的错误记录及是否显示详情模态框
  const [selectedError, setSelectedError] = useState<ErrorRecord | null>(null);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  // 新增状态 - 选中的历史记录索引
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState<number>(-1);

  // 新增状态 - 模态框标签页
  const [detailTabKey, setDetailTabKey] = useState<string>("detail");

  // 使用App中的Modal方法
  const { modal, message } = App.useApp();

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

  // 获取特定错误类型的百分比
  const getErrorTypePercentage = (record: ErrorRecord, type: ErrorType) => {
    if (!record.errorTypes || !record.errorTypes[type]) return 0;
    return Math.round((record.errorTypes[type] / record.count) * 100);
  };

  // 获取主要错误类型
  const getMainErrorType = (record: ErrorRecord) => {
    if (!record.errorTypes) return ErrorType.OTHER;

    let mainType = ErrorType.OTHER;
    let maxCount = 0;

    Object.entries(record.errorTypes).forEach(([type, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mainType = type as ErrorType;
      }
    });

    return mainType;
  };

  // 获取过滤后的单词错误数据
  const filteredWordErrors = useMemo(() => {
    if (!currentFilter) return wordErrors;

    return wordErrors.filter((record) => {
      const mainErrorType = getMainErrorType(record);
      return mainErrorType === currentFilter;
    });
  }, [wordErrors, currentFilter]);

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
      sorter: (a: ErrorRecord, b: ErrorRecord) => a.count - b.count,
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
      sorter: (a: ErrorRecord, b: ErrorRecord) =>
        new Date(a.lastErrorTime || 0).getTime() -
        new Date(b.lastErrorTime || 0).getTime(),
      defaultSortOrder: "descend",
      sortDirections: ["descend", "ascend", "descend"],
    },
    {
      title: "操作",
      key: "action",
      render: (_: unknown, record: ErrorRecord) => (
        <Button
          type="link"
          onClick={() => showErrorDetail(record)}
          disabled={!record.lastUserInput || !record.lastAnalysisResult}
        >
          查看详情
        </Button>
      ),
      width: 100,
    },
  ];

  // 单词错误表格列定义
  const wordColumns = [
    {
      title: "单词",
      dataIndex: "word",
      key: "word",
      render: (word: string, record: ErrorRecord) => {
        const mainErrorType = getMainErrorType(record);
        return <Tag color={ErrorTypeColors[mainErrorType]}>{word}</Tag>;
      },
      width: 150,
    },
    {
      title: "错误次数",
      dataIndex: "count",
      key: "count",
      render: (count: number) => <Tag color="error">{count} 次</Tag>,
      width: 100,
      sorter: (a: ErrorRecord, b: ErrorRecord) => a.count - b.count,
    },
    {
      title: (
        <Tooltip title="点击列标题可按错误类型筛选">
          <Space>
            主要错误类型 <InfoCircleOutlined style={{ fontSize: "12px" }} />
          </Space>
        </Tooltip>
      ),
      key: "mainErrorType",
      render: (_: any, record: ErrorRecord) => {
        const mainErrorType = getMainErrorType(record);
        return (
          <Tag
            color={ErrorTypeColors[mainErrorType]}
            style={{ minWidth: "80px", textAlign: "center" }}
          >
            {ErrorTypeNames[mainErrorType]}
          </Tag>
        );
      },
      width: 150,
      filters: Object.entries(ErrorTypeNames).map(([type, name]) => ({
        text: name,
        value: type,
      })),
      onFilter: (value: string, record: ErrorRecord) => {
        const mainErrorType = getMainErrorType(record);
        return mainErrorType === value;
      },
    },
    {
      title: "最近错误样例",
      key: "recentError",
      render: (_: any, record: ErrorRecord) => {
        if (!record.wrongInputs || record.wrongInputs.length === 0) {
          return <Text type="secondary">无记录</Text>;
        }

        // 获取最近一次错误
        const recentError = [...record.wrongInputs].sort(
          (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
        )[0];

        // 根据错误类型定制显示
        const renderSample = () => {
          const errorType = recentError.errorType;

          if (errorType === ErrorType.MISSING_WORD) {
            return (
              <Text type="warning" style={{ fontStyle: "italic" }}>
                [漏写]
              </Text>
            );
          } else if (errorType === ErrorType.EXTRA_WORD) {
            return (
              <Text type="warning" style={{ fontStyle: "italic" }}>
                [多写] {recentError.input}
              </Text>
            );
          } else if (errorType === ErrorType.TENSE) {
            return (
              <Space>
                <Text strong>{record.word}</Text>
                <Text type="secondary">→</Text>
                <Text code type="danger">
                  {recentError.input || "[空]"}
                </Text>
              </Space>
            );
          } else {
            return (
              <Text code type="danger">
                {recentError.input || "[空]"}
              </Text>
            );
          }
        };

        return <Space>{renderSample()}</Space>;
      },
      width: 300,
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
      sorter: (a: ErrorRecord, b: ErrorRecord) =>
        new Date(a.lastErrorTime || 0).getTime() -
        new Date(b.lastErrorTime || 0).getTime(),
    },
  ];

  // 渲染表格时使用React.memo来优化性能
  const StatisticsTable = ({
    dataSource,
    columns,
    rowKey,
  }: {
    dataSource: ErrorRecord[];
    columns: any[];
    rowKey: string;
  }) => {
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
        virtual={false}
        sticky={true}
      />
    );
  };

  // 处理数据库清理
  const handleCleanupDatabase = async () => {
    // 显示确认对话框
    modal.confirm({
      title: "数据库维护",
      icon: <InfoCircleOutlined />,
      content:
        "此操作将检查并修复可能存在的重复数据，包括错误记录计数问题。确定要继续吗？",
      okText: "开始修复",
      cancelText: "取消",
      async onOk() {
        try {
          setIsLoading(true);
          const result = await cleanupDuplicateRecords();

          // 刷新数据
          await loadStatistics();

          // 显示结果
          if (result.success) {
            if (result.totalFixed > 0) {
              modal.success({
                title: "数据库修复完成",
                content: (
                  <div>
                    <p>成功修复了 {result.totalFixed} 条记录。</p>
                    {result.fixedWords.length > 0 && (
                      <div>
                        <p>修复的记录:</p>
                        <ul style={{ maxHeight: "200px", overflow: "auto" }}>
                          {result.fixedWords.slice(0, 10).map((word, index) => (
                            <li key={index}>{word}</li>
                          ))}
                          {result.fixedWords.length > 10 && (
                            <li>...共 {result.fixedWords.length} 条记录</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                ),
              });
            } else {
              modal.success({
                title: "数据库状态良好",
                content: "没有发现需要修复的问题。",
              });
            }
          } else {
            modal.error({
              title: "修复失败",
              content: "数据库修复过程中出现错误，请稍后再试。",
            });
          }
        } catch (error) {
          console.error("数据库修复失败:", error);
          modal.error({
            title: "修复出错",
            content: "数据库修复过程中出现错误，请稍后再试。",
          });
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  // 修改题目错误表格
  const QuestionTable = () => (
    <Card
      title="题目错误统计"
      extra={<Space>{/* 移除数据库维护和清除所有数据按钮 */}</Space>}
    >
      <StatisticsTable
        dataSource={questionErrors}
        columns={questionColumns}
        rowKey="id"
      />
    </Card>
  );

  // 修改单词错误表格
  const WordTable = () => (
    <Card
      title={
        <Space>
          <span>单词错误统计</span>
          {/* 错误类型筛选器 */}
          <div style={{ marginLeft: "20px" }}>
            <Space wrap>
              {Object.entries(ErrorTypeNames).map(([type, name]) => (
                <Tag
                  key={type}
                  color={
                    currentFilter === type
                      ? ErrorTypeColors[type as ErrorType]
                      : currentFilter === null
                      ? ErrorTypeColors[type as ErrorType] // 使颜色与下面的错误类型颜色一致
                      : "default"
                  }
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    setCurrentFilter(
                      currentFilter === type ? null : (type as ErrorType)
                    )
                  }
                >
                  {name}
                  {currentFilter === type && " ✓"}
                </Tag>
              ))}
            </Space>
          </div>
        </Space>
      }
      extra={<Space>{/* 移除数据库维护和清除所有数据按钮 */}</Space>}
    >
      <StatisticsTable
        dataSource={filteredWordErrors}
        columns={wordColumns}
        rowKey="word"
      />
    </Card>
  );

  // 定义 Tabs 的 items 配置
  const tabItems = useMemo(() => {
    return [
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
                      value={filteredWordErrors.length}
                      valueStyle={{ color: "#722ed1" }}
                      prefix={<TranslationOutlined />}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="总错误次数"
                      value={filteredWordErrors.reduce(
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
    ];
  }, [
    isLoading,
    questionErrors,
    filteredWordErrors,
    loadError,
    loadStatistics,
    currentFilter,
    activeTab,
  ]);

  // 使用useEffect记录渲染信息
  useEffect(() => {
    console.log(
      `[RENDER] isLoading=${isLoading}, wordErrors=${wordErrors.length}, questionErrors=${questionErrors.length}, updateCounter=${updateCounter}`
    );
  }, [isLoading, wordErrors.length, questionErrors.length, updateCounter]);

  // 显示错误详情
  const showErrorDetail = (record: ErrorRecord) => {
    setSelectedError(record);
    // 默认显示最新的错误记录
    if (record.errorHistory && record.errorHistory.length > 0) {
      setSelectedHistoryIndex(record.errorHistory.length - 1);
    } else {
      setSelectedHistoryIndex(-1);
    }
    setIsDetailModalVisible(true);
  };

  // 关闭详情模态框
  const closeDetailModal = () => {
    setIsDetailModalVisible(false);
    setSelectedError(null);
    setSelectedHistoryIndex(-1);
  };

  // 切换到指定的历史记录
  const switchToHistory = (index: number) => {
    if (
      selectedError?.errorHistory &&
      index >= 0 &&
      index < selectedError.errorHistory.length
    ) {
      setSelectedHistoryIndex(index);
    }
  };

  // 渲染错误分析 - 修改为根据selectedHistoryIndex显示对应的历史记录
  const renderErrorAnalysis = () => {
    if (!selectedError) return null;

    // 获取当前选中的分析结果和用户输入
    let analysis: any = null;
    let userInput: string = "";
    let errorTime: string = "";

    if (
      selectedError.errorHistory &&
      selectedError.errorHistory.length > 0 &&
      selectedHistoryIndex >= 0
    ) {
      // 显示历史记录
      const historyItem = selectedError.errorHistory[selectedHistoryIndex];
      analysis = historyItem.analysisResult;
      userInput = historyItem.userInput;
      errorTime = historyItem.errorTime;
    } else {
      // 兼容旧版本数据，显示最后一次记录
      analysis = selectedError.lastAnalysisResult;
      userInput = selectedError.lastUserInput || "";
      errorTime = selectedError.lastErrorTime;
    }

    if (!analysis) return null;

    return (
      <div>
        <Card
          title={
            <Space>
              <span>正确答案</span>
              {errorTime && (
                <Text type="secondary">
                  (错误时间: {formatDateTime(errorTime)})
                </Text>
              )}
            </Space>
          }
          size="small"
          style={{ marginBottom: 16 }}
        >
          <Text>{selectedError.text}</Text>
        </Card>

        <Card
          title={
            <div>
              <Space>
                <InfoCircleOutlined /> 你的答案
              </Space>
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <Tag color="success">正确单词</Tag>
                <Tag color="error">错误单词</Tag>
                <Tag color="warning">漏词/多词</Tag>
              </div>
            </div>
          }
          size="small"
          style={{ marginBottom: 16 }}
        >
          {userInput ? (
            <Space wrap>
              {userInput
                .trim()
                .split(/\s+/)
                .map((word, i) => {
                  // 检查单词是否在正确单词列表中
                  const isInCorrectList =
                    analysis.correctWords &&
                    analysis.correctWords.includes(word);

                  // 检查单词是否是额外单词
                  const isExtraWord =
                    analysis.extraWords && analysis.extraWords.includes(word);

                  // 设置标签颜色
                  let tagColor = "default";
                  if (isInCorrectList) {
                    tagColor = "success";
                  } else if (isExtraWord) {
                    tagColor = "warning"; // 多余词用黄色标记
                  } else {
                    tagColor = "error";
                  }

                  return (
                    <Tag
                      key={i}
                      color={tagColor}
                      style={{
                        padding: "4px 8px",
                        fontSize: 14,
                        fontWeight: isInCorrectList ? "normal" : "bold",
                        margin: "0 4px 8px 0",
                      }}
                    >
                      {word}
                      {isExtraWord && (
                        <sup style={{ marginLeft: 2, color: "orange" }}>+</sup>
                      )}
                    </Tag>
                  );
                })}
            </Space>
          ) : (
            <Text type="secondary" italic>
              未输入任何内容
            </Text>
          )}
        </Card>

        <Card
          title={
            <Space>
              <BarChartOutlined /> 详细统计
            </Space>
          }
          size="small"
          style={{ background: "#f0f5ff", marginBottom: 16 }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Card size="small">
                <Statistic
                  title="正确单词"
                  value={
                    analysis.correctWords ? analysis.correctWords.length : 0
                  }
                  valueStyle={{ color: "#3f8600" }}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small">
                <Statistic
                  title="错误单词"
                  value={
                    (analysis.incorrectWords
                      ? analysis.incorrectWords.length
                      : 0) +
                    (analysis.missingWords ? analysis.missingWords.length : 0) +
                    (analysis.extraWords ? analysis.extraWords.length : 0)
                  }
                  valueStyle={{ color: "#cf1322" }}
                  prefix={<CloseCircleOutlined />}
                />
              </Card>
            </Col>
          </Row>
        </Card>

        {analysis.errorDetails && analysis.errorDetails.length > 0 && (
          <Card
            size="small"
            title={
              <Space>
                <BarChartOutlined /> 错误类型分析
              </Space>
            }
          >
            <Space direction="vertical" style={{ width: "100%" }}>
              {analysis.errorDetails
                .map((error: any, index: number) => ({
                  ...error,
                  index, // 保存原始索引以便于识别
                }))
                // 对错误按类型分组显示
                .sort((a: any, b: any) => {
                  // 首先按错误类型排序
                  if (a.errorType !== b.errorType) {
                    return a.errorType.localeCompare(b.errorType);
                  }
                  // 然后按原始索引排序
                  return a.index - b.index;
                })
                .map((error: any) => {
                  // 获取用户输入的错误单词（如果有）
                  let errorWord = error.userWord || "";
                  const errorTypeName =
                    (error.errorType &&
                      ErrorTypeNames[error.errorType as ErrorType]) ||
                    "未知错误";
                  const errorTypeColor =
                    (error.errorType &&
                      ErrorTypeColors[error.errorType as ErrorType]) ||
                    "#999";

                  // 区分不同类型的错误显示
                  let displayErrorWord;

                  if (error.errorType === ErrorType.MISSING_WORD) {
                    // 漏词显示为 [漏写]
                    displayErrorWord = (
                      <span
                        style={{
                          color: "#999",
                          fontStyle: "italic",
                        }}
                      >
                        [漏写]
                      </span>
                    );
                  } else if (error.errorType === ErrorType.EXTRA_WORD) {
                    // 多余单词使用警告样式
                    displayErrorWord = (
                      <Text code type="warning" style={{ fontSize: "16px" }}>
                        {errorWord || ""}
                      </Text>
                    );
                  } else {
                    // 其他错误类型
                    displayErrorWord = (
                      <Text code type="danger" style={{ fontSize: "16px" }}>
                        {errorWord || "未输入"}
                      </Text>
                    );
                  }

                  return (
                    <div
                      key={`${error.originalWord || "extra"}-${error.index}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: 8,
                        padding: "8px",
                        borderRadius: "4px",
                        backgroundColor: `${errorTypeColor}10`,
                        borderLeft: `4px solid ${errorTypeColor}`,
                      }}
                    >
                      <Tag
                        color={errorTypeColor}
                        style={{
                          minWidth: "80px",
                          textAlign: "center",
                          fontWeight: "bold",
                        }}
                      >
                        {errorTypeName}
                      </Tag>
                      <Space align="center" size="middle">
                        <Text strong>{error.originalWord || ""}</Text>
                        {error.originalWord &&
                          error.errorType !== ErrorType.MISSING_WORD && (
                            <Text type="secondary">
                              <RightOutlined />
                            </Text>
                          )}
                        {displayErrorWord}

                        {/* 错误类型说明 */}
                        <Tooltip
                          title={getErrorTypeDescription(
                            error.errorType,
                            error.originalWord,
                            errorWord || ""
                          )}
                          placement="right"
                        >
                          <InfoCircleOutlined
                            style={{ color: errorTypeColor }}
                          />
                        </Tooltip>
                      </Space>
                    </div>
                  );
                })}
            </Space>
          </Card>
        )}
      </div>
    );
  };

  // 渲染历史记录列表
  const renderHistoryList = () => {
    if (
      !selectedError ||
      !selectedError.errorHistory ||
      selectedError.errorHistory.length <= 0
    ) {
      return <Empty description="没有错误历史记录" />;
    }

    return (
      <div style={{ maxHeight: "400px", overflowY: "auto" }}>
        <Timeline
          style={{ margin: "16px 0" }}
          items={selectedError.errorHistory
            .map((item, index) => {
              const isActive = index === selectedHistoryIndex;
              const timestamp = formatDateTime(item.errorTime);

              // 计算错误统计
              const correctCount =
                item.analysisResult.correctWords?.length || 0;
              const incorrectCount =
                (item.analysisResult.incorrectWords?.length || 0) +
                (item.analysisResult.missingWords?.length || 0) +
                (item.analysisResult.extraWords?.length || 0);

              // 获取主要错误类型
              let mainErrorTypes: string[] = [];
              if (
                item.analysisResult.errorDetails &&
                item.analysisResult.errorDetails.length > 0
              ) {
                const errorTypeCounts: Record<string, number> = {};

                // 统计各类型错误数量
                item.analysisResult.errorDetails.forEach((error) => {
                  if (error.errorType) {
                    errorTypeCounts[error.errorType] =
                      (errorTypeCounts[error.errorType] || 0) + 1;
                  }
                });

                // 提取主要错误类型（取前2种）
                mainErrorTypes = Object.entries(errorTypeCounts)
                  .sort(([, countA], [, countB]) => countB - countA)
                  .slice(0, 2)
                  .map(([type]) => ErrorTypeNames[type as ErrorType]);
              }

              return {
                color: isActive ? "blue" : "gray",
                dot: isActive ? <ClockCircleOutlined /> : null,
                children: (
                  <div
                    style={{
                      cursor: "pointer",
                      padding: "8px",
                      backgroundColor: isActive ? "#e6f7ff" : "transparent",
                      borderRadius: "4px",
                      marginBottom: "16px",
                    }}
                    onClick={() => switchToHistory(index)}
                  >
                    <Space direction="vertical" style={{ width: "100%" }}>
                      <Space>
                        <Text strong={isActive}>{timestamp}</Text>
                        {isActive && <Tag color="blue">当前查看</Tag>}
                      </Space>
                      <Space>
                        <Tag color="success">正确: {correctCount}</Tag>
                        <Tag color="error">错误: {incorrectCount}</Tag>
                        {mainErrorTypes.length > 0 && (
                          <Text type="secondary">
                            主要错误: {mainErrorTypes.join(", ")}
                          </Text>
                        )}
                      </Space>
                    </Space>
                  </div>
                ),
              };
            })
            .reverse()} // 最新的显示在上面
        />
      </div>
    );
  };

  // 渲染错误趋势分析
  const renderTrendAnalysis = () => {
    if (
      !selectedError ||
      !selectedError.errorHistory ||
      selectedError.errorHistory.length <= 1
    ) {
      return (
        <Empty
          description="至少需要2次错误记录才能生成趋势分析"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      );
    }

    // 按时间顺序排序错误历史
    const sortedHistory = [...selectedError.errorHistory].sort(
      (a, b) =>
        new Date(a.errorTime).getTime() - new Date(b.errorTime).getTime()
    );

    // 提取错误类型随时间的变化
    const errorTypeData = sortedHistory.map((item, index) => {
      // 分析错误类型
      const errorTypeCounts: Record<string, number> = {};

      // 统计各类型错误数量
      if (
        item.analysisResult.errorDetails &&
        item.analysisResult.errorDetails.length > 0
      ) {
        item.analysisResult.errorDetails.forEach((error) => {
          if (error.errorType) {
            errorTypeCounts[error.errorType] =
              (errorTypeCounts[error.errorType] || 0) + 1;
          }
        });
      }

      // 将错误类型数量转换为每种类型的百分比
      const totalErrors = Object.values(errorTypeCounts).reduce(
        (sum, count) => sum + count,
        0
      );
      const errorTypePercentages = Object.fromEntries(
        Object.entries(errorTypeCounts).map(([type, count]) => [
          type,
          totalErrors > 0 ? Math.round((count / totalErrors) * 100) : 0,
        ])
      );

      return {
        time: formatDateTime(item.errorTime),
        index: index + 1,
        correctCount: item.analysisResult.correctWords?.length || 0,
        incorrectCount:
          (item.analysisResult.incorrectWords?.length || 0) +
          (item.analysisResult.missingWords?.length || 0) +
          (item.analysisResult.extraWords?.length || 0),
        errorTypes: errorTypePercentages,
      };
    });

    // 绘制正确/错误单词数量趋势
    const renderWordCountTrend = () => {
      return (
        <Card
          title="正确与错误单词数量趋势"
          size="small"
          style={{ marginBottom: 16 }}
        >
          {errorTypeData.map((item, index) => (
            <div key={index} style={{ marginBottom: 8 }}>
              <Text type="secondary">
                第{item.index}次 ({item.time})
              </Text>
              <div style={{ marginTop: 4 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <div style={{ width: 60 }}>正确：</div>
                  <div style={{ flex: 1 }}>
                    <Progress
                      percent={
                        (item.correctCount /
                          (item.correctCount + item.incorrectCount)) *
                        100
                      }
                      success={{
                        percent:
                          (item.correctCount /
                            (item.correctCount + item.incorrectCount)) *
                          100,
                      }}
                      format={() => `${item.correctCount}个`}
                      status="normal"
                    />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div style={{ width: 60 }}>错误：</div>
                  <div style={{ flex: 1 }}>
                    <Progress
                      percent={
                        (item.incorrectCount /
                          (item.correctCount + item.incorrectCount)) *
                        100
                      }
                      strokeColor="#ff4d4f"
                      format={() => `${item.incorrectCount}个`}
                      status="normal"
                    />
                  </div>
                </div>
              </div>
              {index < errorTypeData.length - 1 && (
                <Divider style={{ margin: "12px 0" }} />
              )}
            </div>
          ))}
        </Card>
      );
    };

    // 绘制错误类型趋势
    const renderErrorTypeTrend = () => {
      // 收集所有出现过的错误类型
      const allErrorTypes = new Set<string>();
      errorTypeData.forEach((item) => {
        Object.keys(item.errorTypes).forEach((type) => {
          allErrorTypes.add(type);
        });
      });

      return (
        <Card title="错误类型趋势分析" size="small">
          {Array.from(allErrorTypes).map((errorType) => {
            // 跟踪该错误类型在每次错误中的占比变化
            const typePercentages = errorTypeData.map((item) => ({
              time: item.time,
              index: item.index,
              percentage: item.errorTypes[errorType] || 0,
            }));

            // 计算趋势方向
            const firstValue = typePercentages[0].percentage;
            const lastValue =
              typePercentages[typePercentages.length - 1].percentage;
            const trend = lastValue - firstValue;

            let trendIcon = null;
            let trendColor = "";
            if (trend < -10) {
              trendIcon = "↓";
              trendColor = "#52c41a"; // 绿色，表示错误减少
            } else if (trend > 10) {
              trendIcon = "↑";
              trendColor = "#ff4d4f"; // 红色，表示错误增加
            } else {
              trendIcon = "→";
              trendColor = "#1890ff"; // 蓝色，表示错误稳定
            }

            return (
              <div key={errorType} style={{ marginBottom: 16 }}>
                <Space align="center">
                  <Tag
                    color={ErrorTypeColors[errorType as ErrorType]}
                    style={{ minWidth: 80, textAlign: "center" }}
                  >
                    {ErrorTypeNames[errorType as ErrorType]}
                  </Tag>
                  <Text type="secondary">
                    从 {firstValue}% 到 {lastValue}%
                  </Text>
                  <Text style={{ color: trendColor, fontWeight: "bold" }}>
                    {trendIcon} {Math.abs(trend)}%
                  </Text>
                </Space>
                <div style={{ marginTop: 8 }}>
                  {typePercentages.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ width: 80 }}>第{item.index}次:</div>
                      <div style={{ flex: 1 }}>
                        <Progress
                          percent={item.percentage}
                          strokeColor={ErrorTypeColors[errorType as ErrorType]}
                          format={() => `${item.percentage}%`}
                          size="small"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>
      );
    };

    return (
      <div>
        <Alert
          message="学习进步趋势分析"
          description="分析您在多次练习中的错误类型变化，帮助您了解自己的进步情况和需要加强的方面。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        {renderWordCountTrend()}
        {renderErrorTypeTrend()}
      </div>
    );
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
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
              (activeTab === "words" && wordErrors.length > 0)) && <></>
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

      {/* 错误详情模态框 - 改为左侧历史记录，右侧详情 */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            错误详情分析
            {selectedError && (
              <Space>
                <Text type="secondary">（题号: {selectedError.id}）</Text>
                <Badge
                  count={selectedError.count}
                  style={{ backgroundColor: "#ff4d4f" }}
                  title={`共错误${selectedError.count}次`}
                />
              </Space>
            )}
          </Space>
        }
        open={isDetailModalVisible}
        onCancel={closeDetailModal}
        footer={[
          <Button key="close" onClick={closeDetailModal}>
            关闭
          </Button>,
        ]}
        width={1000}
      >
        {selectedError && (
          <Row gutter={24}>
            {/* 如果有历史记录，显示左侧历史列表 */}
            {selectedError.errorHistory &&
            selectedError.errorHistory.length > 0 ? (
              <>
                <Col span={8}>
                  <Card
                    title={
                      <Space>
                        <HistoryOutlined />
                        历史错误记录
                        <Badge
                          count={selectedError.errorHistory.length}
                          style={{ backgroundColor: "#1890ff" }}
                        />
                      </Space>
                    }
                    size="small"
                    style={{ height: "100%" }}
                  >
                    {renderHistoryList()}
                  </Card>
                </Col>
                <Col span={16}>
                  <Tabs
                    activeKey={detailTabKey}
                    onChange={setDetailTabKey}
                    items={[
                      {
                        key: "detail",
                        label: (
                          <span>
                            <FileTextOutlined /> 详细分析
                          </span>
                        ),
                        children: renderErrorAnalysis(),
                      },
                      {
                        key: "trend",
                        label: (
                          <span>
                            <BarChartOutlined /> 趋势分析
                          </span>
                        ),
                        children: renderTrendAnalysis(),
                      },
                    ]}
                  />
                </Col>
              </>
            ) : (
              // 没有历史记录，只显示最后一次错误详情
              <Col span={24}>{renderErrorAnalysis()}</Col>
            )}
          </Row>
        )}
      </Modal>
    </div>
  );
}
