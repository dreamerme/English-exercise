"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Bo } from "../data/dictation-data";
import {
  recordQuestionError,
  recordWordError,
  saveProgress,
  getProgress,
  clearProgress,
  getShortcutsSettings,
  ErrorType,
  ErrorTypeNames,
  ErrorTypeColors,
  compareTexts,
} from "../utils/statisticsDB";
import {
  Typography,
  Button,
  Card,
  Input,
  Space,
  Row,
  Col,
  Badge,
  Tag,
  Tooltip,
  Form,
  message,
  Result,
  Statistic,
  Divider,
} from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  LeftOutlined,
  RightOutlined,
  ReloadOutlined,
  CheckOutlined,
  FileTextOutlined,
  SoundOutlined,
  InfoCircleOutlined,
  BarChartOutlined,
  PlusOutlined,
} from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface DictationResult {
  isCorrect: boolean;
  originalText: string;
  userInput: string;
  correctWords: string[];
  incorrectWords: string[];
  missingWords: string[];
  extraWords: string[];
  errorDetails?: Array<{
    originalWord: string;
    userWord?: string;
    errorType: ErrorType;
  }>;
}

// 快捷键配置的接口
interface ShortcutConfig {
  key: string;
  shiftKey: boolean;
  ctrlKey?: boolean; // 添加Ctrl键支持
  altKey?: boolean; // 添加Alt键支持
  description: string;
}

interface ShortcutsSettings {
  submit: ShortcutConfig;
  playAudio: ShortcutConfig;
  nextQuestion: ShortcutConfig;
  prevQuestion: ShortcutConfig;
  resetQuestion: ShortcutConfig;
}

// 默认快捷键配置
const DEFAULT_SHORTCUTS: ShortcutsSettings = {
  submit: { key: "Enter", shiftKey: false, description: "提交答案" },
  playAudio: { key: "Enter", shiftKey: true, description: "播放音频" },
  nextQuestion: { key: "n", shiftKey: true, description: "下一题" },
  prevQuestion: { key: "r", shiftKey: true, description: "上一题" },
  resetQuestion: { key: "f", shiftKey: true, description: "重置当前题目" },
};

// 从IndexedDB加载快捷键设置
const loadShortcutsFromIndexedDB = async (): Promise<ShortcutsSettings> => {
  try {
    const settings = await getShortcutsSettings();
    console.log("从IndexedDB加载快捷键设置:", settings);

    if (!settings) {
      console.warn("未找到快捷键设置，使用默认值");
      return DEFAULT_SHORTCUTS;
    }

    // 去除ID和时间戳，只保留配置部分
    const { ...shortcutsConfig } = settings;
    return shortcutsConfig as ShortcutsSettings;
  } catch (error) {
    console.error("从IndexedDB加载快捷键设置失败:", error);
    return DEFAULT_SHORTCUTS;
  }
};

// 格式化快捷键为显示文本
const formatShortcut = (shortcut: ShortcutConfig): string => {
  let result = "";
  if (shortcut.ctrlKey) result += "Ctrl + ";
  if (shortcut.altKey) result += "Alt + ";
  if (shortcut.shiftKey) result += "Shift + ";
  result += shortcut.key;
  return result;
};

// 获取错误类型的详细描述
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

export default function DictationExercise() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userInput, setUserInput] = useState("");
  const [result, setResult] = useState<DictationResult | null>(null);
  const [jumpToQuestion, setJumpToQuestion] = useState("");
  const [hasProgress, setHasProgress] = useState(false); // 是否有进度可恢复
  const [progressRestored, setProgressRestored] = useState(false); // 进度是否已被恢复
  const [userAnswers, setUserAnswers] = useState<string[]>([]); // 保存用户所有答案
  const [startTime, setStartTime] = useState<string>(""); // 开始时间
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true); // 自动保存进度开关
  const [isRestoringProgress, setIsRestoringProgress] = useState(false); // 是否正在恢复进度
  const audioRef = useRef<HTMLAudioElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [form] = Form.useForm();
  const containerRef = useRef<HTMLDivElement>(null);

  // 使用 useMessage hook 以支持主题和国际化
  const [messageApi, contextHolder] = message.useMessage();

  const currentItem = Bo[currentIndex];

  // 添加state来存储快捷键设置
  const [shortcuts, setShortcuts] =
    useState<ShortcutsSettings>(DEFAULT_SHORTCUTS);

  // 添加状态跟踪UI刷新
  const [uiRefreshTrigger, setUIRefreshTrigger] = useState(0);

  // 从单词中移除句号（如果存在）
  const removePeriod = (word: string) => {
    return word.endsWith(".") ? word.slice(0, -1) : word;
  };

  // 分析文本匹配度
  const analyzeText = useCallback(
    (original: string, input: string): DictationResult => {
      // 处理输入，确保它有正确的结尾句号
      let processedInput = input.trim();
      if (!processedInput.endsWith(".")) {
        processedInput += ".";
      }

      // 确保原始文本也有结尾句号
      let processedOriginal = original.trim();
      if (!processedOriginal.endsWith(".")) {
        processedOriginal += ".";
      }

      // 使用改进的compareTexts函数进行文本比较
      const comparisonResult = compareTexts(processedOriginal, processedInput);

      // 提取正确、错误和缺失的单词
      const correctWords = comparisonResult
        .filter((item) => item.status === "correct")
        .map((item) => item.word);

      // 提取错误单词 - 不包括额外单词
      const incorrectWords = comparisonResult
        .filter((item) => item.status === "incorrect")
        .map((item) => item.userWord || "");

      // 提取额外单词 - 这些是用户输入多余的单词
      const extraWords = comparisonResult
        .filter((item) => item.status === "extra")
        .map((item) => item.word);

      console.log("[analyzeText] 额外单词:", extraWords);

      const missingWords = comparisonResult
        .filter((item) => item.status === "missing")
        .map((item) => item.word);

      // 构建详细的错误信息
      const errorDetails = comparisonResult
        .filter(
          (item) =>
            item.status === "missing" ||
            item.status === "incorrect" ||
            item.status === "extra"
        )
        .map((item) => {
          if (item.status === "extra") {
            // 多余单词，用户输入了但原文没有
            return {
              originalWord: "", // 原文中没有对应单词
              userWord: item.word, // 用户输入的额外单词
              errorType: ErrorType.EXTRA_WORD,
            };
          } else if (item.status === "missing") {
            // 缺失单词，原文有但用户没输入
            return {
              originalWord: item.word, // 应该输入的单词
              userWord: undefined, // 用户没输入
              errorType: ErrorType.MISSING_WORD,
            };
          } else {
            // 不正确的单词，对应关系已在compareTexts中建立
            return {
              originalWord: item.word, // 原文中的正确单词
              userWord: item.userWord, // 用户输入的错误单词
              errorType: item.errorType || ErrorType.OTHER,
            };
          }
        });

      // 确定答案是否正确
      const isCorrect =
        incorrectWords.length === 0 &&
        missingWords.length === 0 &&
        extraWords.length === 0;

      console.debug("分析结果:", {
        correctWords,
        incorrectWords,
        missingWords,
        extraWords,
        errorDetails,
      });

      return {
        isCorrect,
        originalText: processedOriginal,
        userInput: processedInput,
        correctWords,
        incorrectWords,
        missingWords,
        extraWords,
        errorDetails,
      };
    },
    []
  );

  // 监听currentIndex变化，自动播放音频
  useEffect(() => {
    // 清除可能存在的定时器
    if (nextTimerRef.current) {
      clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }

    // 短暂延迟确保音频元素已加载完毕
    const timer = setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play().catch((error) => {
          console.log("音频自动播放失败:", error);
          // 自动播放可能因浏览器策略被阻止，这里不处理错误
        });
      }

      // 自动聚焦到文本框
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      if (nextTimerRef.current) {
        clearTimeout(nextTimerRef.current);
      }
    };
  }, [currentIndex]);

  // 组件挂载时也自动聚焦
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // 组件挂载时检查是否有保存的进度
  useEffect(() => {
    const checkSavedProgress = async () => {
      try {
        const savedProgress = await getProgress();
        if (savedProgress) {
          console.log("找到保存的进度:", savedProgress);

          // 直接恢复进度，不再显示提示框
          console.log("正在自动恢复进度...");
          setCurrentIndex(savedProgress.currentQuestionIndex);
          setUserAnswers(savedProgress.userAnswers);
          setStartTime(savedProgress.startTime);
          // 设置当前题目的用户输入
          if (savedProgress.userAnswers[savedProgress.currentQuestionIndex]) {
            setUserInput(
              savedProgress.userAnswers[savedProgress.currentQuestionIndex]
            );
            form.setFieldsValue({
              userInput:
                savedProgress.userAnswers[savedProgress.currentQuestionIndex],
            });
          }
          setProgressRestored(true); // 标记进度已被恢复

          // 显示进度恢复成功消息
          window.setTimeout(() => {
            messageApi.success("已自动恢复上次进度");
          }, 500);
        } else {
          // 如果没有保存的进度，则初始化开始时间
          setStartTime(new Date().toISOString());
        }
      } catch (error) {
        console.error("检查保存进度失败:", error);
        // 使用 messageApi 显示错误消息
        window.setTimeout(() => {
          messageApi.error("加载保存的进度失败");
        }, 0);
      }
    };

    checkSavedProgress();
  }, [form, messageApi]);

  // 自动保存进度
  useEffect(() => {
    // 只有当自动保存开启且不是正在恢复进度时才保存
    if (!autoSaveEnabled || isRestoringProgress) return;

    // 创建新的答案数组副本，但不直接更新state
    const updatedAnswers = [...userAnswers];
    // 只更新当前索引的值，如果值不同才更新
    if (updatedAnswers[currentIndex] !== userInput) {
      updatedAnswers[currentIndex] = userInput;
      // 注意：这里不再调用setUserAnswers，避免无限循环
    }

    // 自动保存进度的函数
    const autoSave = async () => {
      try {
        if (startTime) {
          await saveProgress({
            currentQuestionIndex: currentIndex,
            userAnswers: updatedAnswers, // 使用局部变量，不依赖state更新
            startTime: startTime,
            lastUpdateTime: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error("自动保存进度失败:", error);
      }
    };

    // 设置防抖定时器，防止频繁保存
    const debounceTimer = setTimeout(autoSave, 1000);
    return () => clearTimeout(debounceTimer);
  }, [
    currentIndex,
    userInput,
    autoSaveEnabled,
    isRestoringProgress,
    userAnswers,
    startTime,
  ]);

  const handleNext = useCallback(() => {
    if (nextTimerRef.current) {
      clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
    // 创建新的答案数组副本，保存当前答案
    const updatedAnswers = [...userAnswers];
    updatedAnswers[currentIndex] = userInput;
    setUserAnswers(updatedAnswers);

    setCurrentIndex((prev) => (prev + 1) % Bo.length);

    // 检查下一题是否有保存的答案
    const nextIndex = (currentIndex + 1) % Bo.length;
    if (updatedAnswers[nextIndex]) {
      setUserInput(updatedAnswers[nextIndex]);
      form.setFieldsValue({ userInput: updatedAnswers[nextIndex] });
    } else {
      setUserInput("");
      form.resetFields();
    }

    setResult(null);
  }, [currentIndex, form, userAnswers, userInput]);

  const handlePrevious = useCallback(() => {
    if (nextTimerRef.current) {
      clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }
    // 创建新的答案数组副本，保存当前答案
    const updatedAnswers = [...userAnswers];
    updatedAnswers[currentIndex] = userInput;
    setUserAnswers(updatedAnswers);

    const prevIndex = (currentIndex - 1 + Bo.length) % Bo.length;
    setCurrentIndex(prevIndex);

    // 检查上一题是否有保存的答案
    if (updatedAnswers[prevIndex]) {
      setUserInput(updatedAnswers[prevIndex]);
      form.setFieldsValue({ userInput: updatedAnswers[prevIndex] });
    } else {
      setUserInput("");
      form.resetFields();
    }

    setResult(null);
  }, [currentIndex, form, userAnswers, userInput]);

  // 修改handleSubmit使用messageApi
  const handleSubmit = useCallback(
    (eventOrValues?: React.FormEvent | Record<string, unknown>) => {
      // 如果是事件对象，阻止默认行为
      if (eventOrValues && typeof eventOrValues.preventDefault === "function") {
        eventOrValues.preventDefault();
      }

      // 不再需要显式调用 form.submit()，因为 Form 的 onFinish 已经处理提交了
      // 只在直接调用 handleSubmit 时处理提交
      if (eventOrValues && typeof eventOrValues.preventDefault === "function") {
        form.submit();
      }

      // 取消可能存在的旧定时器
      if (nextTimerRef.current) {
        clearTimeout(nextTimerRef.current);
        nextTimerRef.current = null;
      }

      // 分析答案
      const analysisResult = analyzeText(currentItem.text, userInput);
      setResult(analysisResult);

      // 记录错误数据到IndexedDB
      if (!analysisResult.isCorrect) {
        // 记录题目错误
        recordQuestionError(
          currentItem.id,
          currentItem.text,
          analysisResult.userInput,
          analysisResult
        );

        // 使用Set记录已经处理过的多余单词，避免重复记录
        const processedExtraWords = new Set<string>();

        // 处理错误详情并记录
        if (
          analysisResult.errorDetails &&
          analysisResult.errorDetails.length > 0
        ) {
          console.log(
            "[handleSubmit] 处理错误详情:",
            JSON.stringify(analysisResult.errorDetails, null, 2)
          );

          // 记录所有错误详情，首先清晰地区分多余单词
          const extraWordErrors = analysisResult.errorDetails.filter(
            (error) => error.errorType === ErrorType.EXTRA_WORD
          );

          const otherErrors = analysisResult.errorDetails.filter(
            (error) => error.errorType !== ErrorType.EXTRA_WORD
          );

          // 先处理多余单词
          if (extraWordErrors.length > 0) {
            console.log(
              `[handleSubmit] 处理${extraWordErrors.length}个多余单词错误`
            );

            extraWordErrors.forEach((errorDetail) => {
              if (errorDetail.userWord) {
                console.log(
                  `[handleSubmit] 记录多余单词: "${errorDetail.userWord}"`
                );
                recordWordError(
                  "", // 原始单词为空表示这是多余单词
                  analysisResult.originalText,
                  analysisResult.userInput,
                  errorDetail.userWord
                );

                // 将处理过的多余单词添加到集合中
                processedExtraWords.add(
                  errorDetail.userWord.toLowerCase().trim()
                );
              }
            });
          }

          // 再处理其他错误
          otherErrors.forEach((errorDetail) => {
            recordWordError(
              errorDetail.originalWord,
              analysisResult.originalText,
              analysisResult.userInput,
              errorDetail.userWord
            );
          });
        } else {
          // 如果没有错误详情（兼容旧的分析结果），使用原来的错误记录方式
          console.log("[handleSubmit] 使用传统方式记录错误");

          // 创建映射存储已处理的单词位置，避免重复统计
          const processedPositions = new Set<number>();

          // 首先标记用户输入的单词在原文中的状态
          analysisResult.userInput
            .trim()
            .split(/\s+/)
            .forEach((inputWord, inputIndex) => {
              // 去除标点和转小写用于对比
              const cleanInputWord = inputWord
                .replace(/[.,!?;:"'()[\]{}]$/g, "")
                .toLowerCase();

              // 检查这个位置的单词是否正确
              let isCorrectAtPosition = false;
              if (
                inputIndex <
                analysisResult.originalText.trim().split(/\s+/).length
              ) {
                const originalWord = analysisResult.originalText
                  .trim()
                  .split(/\s+/)[inputIndex];
                const cleanOriginalWord = originalWord
                  .replace(/[.,!?;:"'()[\]{}]$/g, "")
                  .toLowerCase();

                // 如果在该位置单词正确，标记该位置已处理
                if (cleanInputWord === cleanOriginalWord) {
                  isCorrectAtPosition = true;
                  processedPositions.add(inputIndex);
                }
              }

              // 如果该位置单词错误，记录原文对应位置的单词
              if (
                !isCorrectAtPosition &&
                inputIndex <
                  analysisResult.originalText.trim().split(/\s+/).length
              ) {
                const originalWord = analysisResult.originalText
                  .trim()
                  .split(/\s+/)[inputIndex];

                if (!processedPositions.has(inputIndex)) {
                  recordWordError(
                    originalWord,
                    analysisResult.originalText,
                    analysisResult.userInput,
                    inputWord
                  );
                  processedPositions.add(inputIndex);
                }
              } else if (
                !isCorrectAtPosition &&
                inputIndex >=
                  analysisResult.originalText.trim().split(/\s+/).length
              ) {
                // 这是多余单词
                console.log(
                  `[handleSubmit] 传统方法检测到多余单词: "${inputWord}"`
                );

                // 检查是否已经处理过此多余单词
                const cleanWord = inputWord.toLowerCase().trim();
                if (!processedExtraWords.has(cleanWord)) {
                  recordWordError(
                    "", // 原始单词为空表示这是多余单词
                    analysisResult.originalText,
                    analysisResult.userInput,
                    inputWord
                  );

                  // 将处理过的多余单词添加到集合中
                  processedExtraWords.add(cleanWord);
                }
              }
            });

          // 处理缺失的单词（即原文中存在但用户完全没有输入的单词）
          for (
            let i = 0;
            i < analysisResult.originalText.trim().split(/\s+/).length;
            i++
          ) {
            if (!processedPositions.has(i)) {
              const originalWord = analysisResult.originalText
                .trim()
                .split(/\s+/)[i];
              recordWordError(
                originalWord,
                analysisResult.originalText,
                analysisResult.userInput
              );
            }
          }
        }

        // 特殊处理extraWords - 确保所有多余单词都被记录，但不重复记录
        if (analysisResult.extraWords && analysisResult.extraWords.length > 0) {
          console.log(
            "[handleSubmit] 特殊处理extraWords:",
            analysisResult.extraWords
          );

          analysisResult.extraWords.forEach((extraWord) => {
            // 检查是否已经处理过此多余单词
            const cleanWord = extraWord.toLowerCase().trim();
            if (!processedExtraWords.has(cleanWord)) {
              console.log(`[handleSubmit] 直接记录多余单词: "${extraWord}"`);
              recordWordError(
                "", // 原始单词为空表示这是多余单词
                analysisResult.originalText,
                analysisResult.userInput,
                extraWord
              );

              // 将处理过的多余单词添加到集合中
              processedExtraWords.add(cleanWord);
            } else {
              console.log(
                `[handleSubmit] 跳过已处理的多余单词: "${extraWord}"`
              );
            }
          });
        }
      }

      // 如果答案正确，直接设置1秒后跳转
      if (analysisResult.isCorrect) {
        // 使用纯JavaScript定时器
        nextTimerRef.current = setTimeout(() => {
          handleNext();
        }, 1000);
      }
    },
    [currentItem.id, currentItem.text, userInput, form, handleNext, analyzeText]
  );

  // 重置当前题目
  const handleReset = useCallback(() => {
    // 取消可能存在的定时器
    if (nextTimerRef.current) {
      clearTimeout(nextTimerRef.current);
      nextTimerRef.current = null;
    }

    setUserInput("");
    setResult(null);
    form.resetFields();

    // 短暂延迟后聚焦到文本框和播放音频
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
      // 播放当前音频
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((error) => {
          console.log("音频自动播放失败:", error);
        });
      }
    }, 100);
  }, [form]);

  // 修改handleJumpToQuestion使用messageApi
  const handleJumpToQuestion = useCallback(() => {
    const questionNumber = parseInt(jumpToQuestion);
    if (
      !isNaN(questionNumber) &&
      questionNumber >= 1 &&
      questionNumber <= Bo.length
    ) {
      setCurrentIndex(questionNumber - 1);
      setUserInput("");
      setResult(null);
      setJumpToQuestion("");
      form.resetFields();
    } else {
      // 使用 messageApi 显示错误消息
      messageApi.error(`请输入1-${Bo.length}之间的题号`);
    }
  }, [jumpToQuestion, form, messageApi]);

  // 检查单词是否正确
  const isWordCorrect = useCallback(
    (word: string, index: number, originalText: string) => {
      const originalWords = originalText.split(/\s+/);
      const isLast =
        index === originalWords.length - 1 ||
        index === originalWords.length - 1;

      // 如果是最后一个单词，移除句号后比较
      if (isLast) {
        return (
          removePeriod(word) ===
          removePeriod(originalWords[Math.min(index, originalWords.length - 1)])
        );
      }

      return index < originalWords.length && word === originalWords[index];
    },
    []
  );

  const handleFormValuesChange = useCallback(
    (changedValues: Record<string, unknown>) => {
      if (changedValues.userInput !== undefined) {
        setUserInput(changedValues.userInput as string);
      }
    },
    []
  );

  // 根据当前快捷键设置动态生成提示文本
  const getShortcutTip = useCallback(
    (action: keyof ShortcutsSettings) => {
      if (!shortcuts || !shortcuts[action]) return "";
      return formatShortcut(shortcuts[action]);
    },
    [shortcuts]
  );

  // 组件挂载时加载快捷键设置
  useEffect(() => {
    const loadShortcuts = async () => {
      try {
        const loadedShortcuts = await loadShortcutsFromIndexedDB();
        setShortcuts(loadedShortcuts);
        console.log("已加载快捷键设置:", loadedShortcuts);
      } catch (error) {
        console.error("加载快捷键设置失败，使用默认值:", error);
        setShortcuts(DEFAULT_SHORTCUTS);
      }
    };

    loadShortcuts();

    // 添加事件监听器以响应快捷键更新
    const handleShortcutsUpdate = (event: CustomEvent) => {
      console.log("检测到快捷键更新事件:", event.detail);
      setShortcuts(event.detail);
      // 刷新UI提示
      setUIRefreshTrigger((prev) => prev + 1); // 触发UI刷新
    };

    // 添加自定义事件监听器
    window.addEventListener(
      "shortcutsUpdated",
      handleShortcutsUpdate as EventListener
    );

    // 清理函数
    return () => {
      window.removeEventListener(
        "shortcutsUpdated",
        handleShortcutsUpdate as EventListener
      );
    };
  }, []);

  // 修改useEffect来使用加载的快捷键设置
  useEffect(() => {
    // 全局键盘事件处理
    const globalKeyHandler = (e: KeyboardEvent) => {
      // 提交答案快捷键处理 - 调试详细信息
      const submitKey = shortcuts.submit.key.toLowerCase();
      const pressedKey = e.key.toLowerCase();

      // 特殊处理提交键的兼容性 (例如 Enter, Return 等)
      const isEnterKey = pressedKey === "enter" || pressedKey === "return";
      const isSubmitKey =
        pressedKey === submitKey || (submitKey === "enter" && isEnterKey);

      const matchesKey = isSubmitKey;
      const matchesShift = e.shiftKey === shortcuts.submit.shiftKey;
      const matchesCtrl = e.ctrlKey === Boolean(shortcuts.submit.ctrlKey);
      const matchesAlt = e.altKey === Boolean(shortcuts.submit.altKey);

      // 提交答案快捷键 - 不要求焦点在文本框中，任何地方都可以触发
      if (matchesKey && matchesShift && matchesCtrl && matchesAlt) {
        e.preventDefault();
        handleSubmit();
        return;
      }

      // 播放音频快捷键
      if (
        e.key.toLowerCase() === shortcuts.playAudio.key.toLowerCase() &&
        e.shiftKey === shortcuts.playAudio.shiftKey &&
        e.ctrlKey === Boolean(shortcuts.playAudio.ctrlKey) &&
        e.altKey === Boolean(shortcuts.playAudio.altKey)
      ) {
        e.preventDefault();
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch((error) => {
            console.log("音频播放失败:", error);
          });
        }
        return;
      }

      // 下一题快捷键
      if (
        e.key.toLowerCase() === shortcuts.nextQuestion.key.toLowerCase() &&
        e.shiftKey === shortcuts.nextQuestion.shiftKey &&
        e.ctrlKey === Boolean(shortcuts.nextQuestion.ctrlKey) &&
        e.altKey === Boolean(shortcuts.nextQuestion.altKey)
      ) {
        e.preventDefault();
        handleNext();
        return;
      }

      // 上一题快捷键
      if (
        e.key.toLowerCase() === shortcuts.prevQuestion.key.toLowerCase() &&
        e.shiftKey === shortcuts.prevQuestion.shiftKey &&
        e.ctrlKey === Boolean(shortcuts.prevQuestion.ctrlKey) &&
        e.altKey === Boolean(shortcuts.prevQuestion.altKey)
      ) {
        e.preventDefault();
        handlePrevious();
        return;
      }

      // 重置当前题目快捷键
      if (
        e.key.toLowerCase() === shortcuts.resetQuestion.key.toLowerCase() &&
        e.shiftKey === shortcuts.resetQuestion.shiftKey &&
        e.ctrlKey === Boolean(shortcuts.resetQuestion.ctrlKey) &&
        e.altKey === Boolean(shortcuts.resetQuestion.altKey)
      ) {
        e.preventDefault();
        handleReset();
        return;
      }
    };

    // 添加事件监听器
    window.addEventListener("keydown", globalKeyHandler, true); // 使用捕获阶段

    // 清理函数
    return () => {
      window.removeEventListener("keydown", globalKeyHandler, true);
    };
  }, [handleSubmit, handleNext, handlePrevious, handleReset, shortcuts]); // 添加shortcuts作为依赖项

  // 修改handleKeyDown函数，因为全局处理器已经处理了大部分快捷键
  const handleKeyDown = useCallback(() => {
    // 本地键盘处理只保留必要的，大部分由全局处理器处理
  }, []);

  // 恢复保存的进度
  const handleRestoreProgress = useCallback(() => {
    setIsRestoringProgress(true);
    // 恢复进度的实际加载在useEffect中处理
  }, []);

  // 清除保存的进度
  const handleClearProgress = useCallback(async () => {
    try {
      await clearProgress();
      setHasProgress(false);
      setProgressRestored(false); // 重置恢复状态
      setUserAnswers([]);
      setStartTime(new Date().toISOString());
      messageApi.success("进度已清除");
    } catch (error) {
      console.error("清除进度失败:", error);
      messageApi.error("清除进度失败");
    }
  }, [messageApi]);

  // 切换自动保存
  const toggleAutoSave = useCallback(() => {
    setAutoSaveEnabled((prev) => {
      const newValue = !prev;
      // 使用 messageApi 避免在状态更新循环中调用全局 message
      setTimeout(() => {
        if (newValue) {
          messageApi.success("已开启自动保存");
        } else {
          messageApi.info("已关闭自动保存");
        }
      }, 0);
      return newValue;
    });
  }, [messageApi]);

  return (
    <div>
      {contextHolder}
      <div
        className="dictation-container"
        ref={containerRef}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <Card
          variant="borderless"
          style={{ maxWidth: 1200, margin: "24px auto" }}
          styles={{ body: {} }}
        >
          <div style={{ padding: "0 20px" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <Badge
                count={`${currentIndex + 1} / ${Bo.length}`}
                style={{ backgroundColor: "#1890ff" }}
              />
            </div>

            <Card
              style={{ marginBottom: 24 }}
              styles={{ body: { padding: 16 } }}
            >
              <Tooltip
                title={`播放音频快捷键: [${getShortcutTip("playAudio")}]`}
              >
                <div style={{ marginBottom: 8 }}>
                  <Space>
                    <SoundOutlined />
                    <Text>听力音频</Text>
                  </Space>
                </div>
              </Tooltip>
              <audio
                ref={audioRef}
                src={`/Audio/${currentItem.id}.mp3`}
                controls
                style={{ width: "100%" }}
              />
            </Card>

            <Card style={{ marginBottom: 24 }} styles={{ body: {} }}>
              <Row justify="space-between" align="middle">
                <Col>
                  <Space>
                    <Input
                      value={jumpToQuestion}
                      onChange={(e) => setJumpToQuestion(e.target.value)}
                      placeholder="输入题号"
                      style={{ width: 100 }}
                      onPressEnter={handleJumpToQuestion}
                    />
                    <Button onClick={handleJumpToQuestion}>跳转</Button>
                  </Space>
                </Col>
                <Col>
                  <Space>
                    {hasProgress && (
                      <Tooltip title="恢复上次进度">
                        <Button
                          icon={<InfoCircleOutlined />}
                          onClick={handleRestoreProgress}
                          type={isRestoringProgress ? "primary" : "default"}
                        >
                          恢复进度
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip title="自动保存">
                      <Button
                        icon={
                          autoSaveEnabled ? (
                            <CheckCircleOutlined />
                          ) : (
                            <CloseCircleOutlined />
                          )
                        }
                        onClick={toggleAutoSave}
                        type={autoSaveEnabled ? "primary" : "default"}
                      >
                        自动保存
                      </Button>
                    </Tooltip>
                    <Tooltip
                      title={`重置 [${getShortcutTip("resetQuestion")}]`}
                    >
                      <Button
                        icon={<ReloadOutlined />}
                        onClick={handleReset}
                        type="default"
                      >
                        重置
                      </Button>
                    </Tooltip>
                    {currentIndex > 0 && (
                      <Tooltip
                        title={`上一题 [${getShortcutTip("prevQuestion")}]`}
                      >
                        <Button
                          icon={<LeftOutlined />}
                          onClick={handlePrevious}
                        >
                          上一题
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip
                      title={`下一题 [${getShortcutTip("nextQuestion")}]`}
                    >
                      <Button icon={<RightOutlined />} onClick={handleNext}>
                        下一题
                      </Button>
                    </Tooltip>
                  </Space>
                </Col>
              </Row>
            </Card>

            <Form
              form={form}
              onFinish={handleSubmit}
              onValuesChange={handleFormValuesChange}
              style={{ marginBottom: 24 }}
            >
              <Form.Item name="userInput" style={{ marginBottom: 16 }}>
                <TextArea
                  ref={textareaRef as any}
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="请输入听到的内容..."
                  autoSize={{ minRows: 3 }}
                  style={{ fontSize: 16 }}
                  spellCheck={false}
                />
              </Form.Item>
              <div style={{ textAlign: "center" }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  icon={<CheckOutlined />}
                >
                  提交答案{" "}
                  <Text style={{ fontSize: 12, opacity: 0.8 }}>
                    [{getShortcutTip("submit")}]
                  </Text>
                </Button>
              </div>
            </Form>

            {result && (
              <div style={{ marginTop: 32 }}>
                {result.isCorrect && (
                  <Result
                    status="success"
                    title="回答正确！"
                    subTitle="1秒后自动跳转到下一题"
                    style={{ padding: "24px 0" }}
                  />
                )}

                {!result.isCorrect && (
                  <Space
                    direction="vertical"
                    style={{ width: "100%" }}
                    size="large"
                  >
                    <Card
                      title={
                        <Space>
                          <FileTextOutlined /> 正确答案
                        </Space>
                      }
                      size="small"
                      styles={{ body: {} }}
                    >
                      <Paragraph style={{ fontSize: 16, fontWeight: 500 }}>
                        {result.originalText}
                      </Paragraph>
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
                      styles={{ body: {} }}
                    >
                      {result.userInput.trim().length > 0 ? (
                        <Space wrap>
                          {result.userInput
                            .trim()
                            .split(/\s+/)
                            .map((word, i) => {
                              // 检查单词是否在正确单词列表中
                              const isInCorrectList =
                                result.correctWords.includes(word);

                              // 检查单词是否是额外单词
                              const isExtraWord =
                                result.extraWords &&
                                result.extraWords.includes(word);

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
                                    fontWeight: isInCorrectList
                                      ? "normal"
                                      : "bold",
                                    margin: "0 4px 8px 0",
                                  }}
                                >
                                  {word}
                                  {isExtraWord && (
                                    <sup
                                      style={{ marginLeft: 2, color: "orange" }}
                                    >
                                      +
                                    </sup>
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
                      style={{ background: "#f0f5ff" }}
                      styles={{ body: {} }}
                    >
                      <Row gutter={16}>
                        <Col span={12}>
                          <Card size="small" styles={{ body: {} }}>
                            <Statistic
                              title="正确单词"
                              value={result.correctWords.length}
                              valueStyle={{ color: "#3f8600" }}
                              prefix={<CheckCircleOutlined />}
                            />
                          </Card>
                        </Col>
                        <Col span={12}>
                          <Card size="small" styles={{ body: {} }}>
                            <Statistic
                              title="错误单词"
                              value={
                                result.incorrectWords.length +
                                result.missingWords.length +
                                (result.extraWords
                                  ? result.extraWords.length
                                  : 0)
                              }
                              valueStyle={{ color: "#cf1322" }}
                              prefix={<CloseCircleOutlined />}
                            />
                          </Card>
                        </Col>
                      </Row>
                    </Card>

                    {/* 错误分析区域 - 改进版 */}
                    {result.errorDetails && result.errorDetails.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <Card
                          size="small"
                          title={
                            <Space>
                              <BarChartOutlined /> 错误类型分析
                            </Space>
                          }
                          styles={{ body: {} }}
                        >
                          <Space direction="vertical" style={{ width: "100%" }}>
                            {/* 统一处理所有类型的错误 */}
                            {result.errorDetails
                              .map((error, index) => ({
                                ...error,
                                index, // 保存原始索引以便于识别
                              }))
                              // 对错误按类型分组显示
                              .sort((a, b) => {
                                // 首先按错误类型排序
                                if (a.errorType !== b.errorType) {
                                  return a.errorType.localeCompare(b.errorType);
                                }
                                // 然后按原始索引排序
                                return a.index - b.index;
                              })
                              .map((error) => {
                                // 获取用户输入的错误单词（如果有）
                                let errorWord = error.userWord || "";
                                const errorTypeName =
                                  ErrorTypeNames[error.errorType];
                                const errorTypeColor =
                                  ErrorTypeColors[error.errorType];

                                // 区分不同类型的错误显示
                                let displayErrorWord;

                                if (
                                  error.errorType === ErrorType.MISSING_WORD
                                ) {
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
                                } else if (
                                  error.errorType === ErrorType.EXTRA_WORD
                                ) {
                                  // 多余单词不再特殊显示，使用与其他错误相同的格式
                                  displayErrorWord = (
                                    <Text
                                      code
                                      type="warning"
                                      style={{ fontSize: "16px" }}
                                    >
                                      {errorWord || ""}
                                    </Text>
                                  );
                                } else {
                                  // 其他错误类型
                                  displayErrorWord = (
                                    <Text
                                      code
                                      type="danger"
                                      style={{ fontSize: "16px" }}
                                    >
                                      {errorWord || "未输入"}
                                    </Text>
                                  );
                                }

                                return (
                                  <div
                                    key={`${error.originalWord || "extra"}-${
                                      error.index
                                    }`}
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
                                      <Text strong>
                                        {error.originalWord || ""}
                                      </Text>
                                      {error.originalWord &&
                                        error.errorType !==
                                          ErrorType.MISSING_WORD && (
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
                      </div>
                    )}
                  </Space>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
