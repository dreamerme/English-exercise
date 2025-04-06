"use client";

// 引入diff-match-patch库
import {
  diff_match_patch,
  DIFF_DELETE,
  DIFF_INSERT,
  DIFF_EQUAL,
} from "diff-match-patch";

// 统计数据相关的IndexedDB操作工具

// 数据库名称和版本
const DB_NAME = "dictation_statistics";
const DB_VERSION = 5; // 将版本号从4升级到5

// 表名
const QUESTION_ERRORS_STORE = "questionErrors";
const WORD_ERRORS_STORE = "wordErrors";
const PROGRESS_STORE = "progress";
const SHORTCUTS_STORE = "shortcuts";

// 错误类型枚举
export enum ErrorType {
  SPELLING = "spelling", // 拼写错误
  MISSING_WORD = "missing_word", // 漏词
  EXTRA_WORD = "extra_word", // 多词
  WORD_ORDER = "word_order", // 词序错误
  TENSE = "tense", // 时态错误
  PART_OF_SPEECH = "part_of_speech", // 词性使用错误
  SYNONYM = "synonym", // 同义词/相似表达
  APPROXIMATE = "approximate", // 近似但不等价表达
  OTHER = "other", // 其他错误
}

// 错误类型显示名称映射
export const ErrorTypeNames: Record<ErrorType, string> = {
  [ErrorType.SPELLING]: "拼写错误",
  [ErrorType.MISSING_WORD]: "漏词",
  [ErrorType.EXTRA_WORD]: "多词",
  [ErrorType.WORD_ORDER]: "词序错误",
  [ErrorType.TENSE]: "时态错误",
  [ErrorType.PART_OF_SPEECH]: "词性错误",
  [ErrorType.SYNONYM]: "同义词误用",
  [ErrorType.APPROXIMATE]: "近似表达",
  [ErrorType.OTHER]: "其他错误",
};

// 错误类型对应的颜色
export const ErrorTypeColors: Record<ErrorType, string> = {
  [ErrorType.SPELLING]: "red",
  [ErrorType.MISSING_WORD]: "orange",
  [ErrorType.EXTRA_WORD]: "gold",
  [ErrorType.WORD_ORDER]: "lime",
  [ErrorType.TENSE]: "green",
  [ErrorType.PART_OF_SPEECH]: "cyan",
  [ErrorType.SYNONYM]: "blue",
  [ErrorType.APPROXIMATE]: "geekblue",
  [ErrorType.OTHER]: "purple",
};

// 创建初始化的错误类型记录，所有类型的错误计数都为0
export function createInitialErrorTypes(
  activeType?: ErrorType
): Record<ErrorType, number> {
  const errorTypes: Record<ErrorType, number> = {
    [ErrorType.SPELLING]: 0,
    [ErrorType.MISSING_WORD]: 0,
    [ErrorType.EXTRA_WORD]: 0,
    [ErrorType.WORD_ORDER]: 0,
    [ErrorType.TENSE]: 0,
    [ErrorType.PART_OF_SPEECH]: 0,
    [ErrorType.SYNONYM]: 0,
    [ErrorType.APPROXIMATE]: 0,
    [ErrorType.OTHER]: 0,
  };
  // 如果指定了活动错误类型，设置其计数为1
  if (activeType) {
    errorTypes[activeType] = 1;
  }
  return errorTypes;
}

// 默认快捷键配置
export const DEFAULT_SHORTCUTS = {
  submit: { key: "Enter", shiftKey: false, description: "提交答案" },
  playAudio: { key: "Enter", shiftKey: true, description: "播放音频" },
  nextQuestion: { key: "N", shiftKey: true, description: "下一题" },
  prevQuestion: { key: "R", shiftKey: true, description: "上一题" },
  resetQuestion: { key: "F", shiftKey: true, description: "重置当前题目" },
};

// 快捷键配置接口
export interface ShortcutConfig {
  key: string;
  shiftKey: boolean;
  description: string;
}

export interface ShortcutsSettings {
  id: string; // 固定ID "user_shortcuts"
  submit: ShortcutConfig;
  playAudio: ShortcutConfig;
  nextQuestion: ShortcutConfig;
  prevQuestion: ShortcutConfig;
  resetQuestion: ShortcutConfig;
  lastUpdateTime: string;
}

// 单词错误记录接口
export interface WordErrorRecord {
  word: string; // 单词
  count: number; // 错误次数
  lastErrorTime: string; // 最近错误时间
  firstErrorTime: string; // 首次错误时间
  errorTypes?: Record<ErrorType, number>; // 各类型错误次数统计
  wrongInputs?: Array<{
    input: string; // 错误输入
    time: string; // 错误时间
    errorType: ErrorType; // 错误类型
  }>; // 错误输入历史记录
}

// 检查IndexedDB是否可用
export function isIndexedDBAvailable(): boolean {
  try {
    // 检查window对象
    if (typeof window === "undefined") {
      console.error("IndexedDB检查失败: 不在浏览器环境中");
      return false;
    }

    // 检查IndexedDB API
    if (!window.indexedDB) {
      console.error("IndexedDB检查失败: 浏览器不支持IndexedDB");
      return false;
    }

    return true;
  } catch (error) {
    console.error("IndexedDB检查失败:", error);
    return false;
  }
}

// 打开数据库连接
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // 如果不在浏览器环境，直接返回错误
    if (!isIndexedDBAvailable()) {
      reject(new Error("IndexedDB不可用"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    // 数据库升级事件 - 初始化表结构
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;
      console.log(
        `正在升级数据库，旧版本: ${oldVersion}，新版本: ${DB_VERSION}`
      );

      // 创建初始表结构（首次安装）
      if (oldVersion < 1) {
        console.log("创建初始数据库结构");

        // 创建题目错误记录表
        if (!db.objectStoreNames.contains("questionErrors")) {
          const questionStore = db.createObjectStore("questionErrors", {
            keyPath: "id",
          });
          questionStore.createIndex("count", "count", { unique: false });
          questionStore.createIndex("lastErrorTime", "lastErrorTime", {
            unique: false,
          });
        }

        // 创建单词错误记录表
        if (!db.objectStoreNames.contains("wordErrors")) {
          const wordStore = db.createObjectStore("wordErrors", {
            keyPath: "word",
          });
          wordStore.createIndex("count", "count", { unique: false });
          wordStore.createIndex("lastErrorTime", "lastErrorTime", {
            unique: false,
          });
        }

        // 创建进度存储表
        if (!db.objectStoreNames.contains("progress")) {
          const progressStore = db.createObjectStore("progress", {
            keyPath: "id",
          });
          progressStore.createIndex("progress", "progress", { unique: false });
        }
      }

      // 版本2 - 添加快捷键配置表
      if (oldVersion < 2) {
        console.log("升级到版本2：添加快捷键配置表");

        // 创建快捷键配置存储表
        if (!db.objectStoreNames.contains(SHORTCUTS_STORE)) {
          db.createObjectStore(SHORTCUTS_STORE, { keyPath: "id" });
          console.log("创建快捷键配置表成功");
        }
      }

      // 版本3 - 添加更多索引或兼容性更改
      if (oldVersion < 3) {
        console.log("升级到版本3：应用兼容性更改");
        // 版本3的升级逻辑（如果有）
      }

      // 版本4 - 增加错误类型分类功能
      if (oldVersion < 4) {
        console.log("升级到版本4：添加单词错误类型分类功能");

        try {
          // 获取wordErrors仓库
          if (db.objectStoreNames.contains(WORD_ERRORS_STORE)) {
            const transaction = (event.target as IDBOpenDBRequest).transaction;

            if (transaction) {
              // 尝试升级现有的单词错误记录，添加错误类型字段
              const wordStore = transaction.objectStore(WORD_ERRORS_STORE);

              // 读取现有记录
              wordStore.openCursor().onsuccess = (cursorEvent) => {
                const cursor = (cursorEvent.target as IDBRequest).result;
                if (cursor) {
                  // 获取当前记录
                  const record = cursor.value;

                  // 添加新的错误类型字段（如果不存在）
                  if (!record.errorTypes) {
                    record.errorTypes = {};

                    // 默认将所有现有错误归类为"其他错误"
                    record.errorTypes[ErrorType.OTHER] = record.count || 0;
                  }

                  if (!record.wrongInputs) {
                    record.wrongInputs = [];
                  }

                  // 更新记录
                  cursor.update(record);

                  // 继续处理下一条记录
                  cursor.continue();
                }
              };
            }

            console.log("单词错误表升级成功");
          }
        } catch (error) {
          console.error("升级单词错误表失败:", error);
          // 升级出错不阻止数据库打开，继续处理
        }
      }

      // 版本5 - 添加错误历史记录功能
      if (oldVersion < 5) {
        console.log("升级到版本5：添加错误历史记录功能");

        try {
          // 获取questionErrors仓库
          if (db.objectStoreNames.contains(QUESTION_ERRORS_STORE)) {
            const transaction = (event.target as IDBOpenDBRequest).transaction;

            if (transaction) {
              // 尝试升级现有的题目错误记录，添加错误历史字段
              const questionStore = transaction.objectStore(
                QUESTION_ERRORS_STORE
              );

              // 读取现有记录
              questionStore.openCursor().onsuccess = (cursorEvent) => {
                const cursor = (cursorEvent.target as IDBRequest).result;
                if (cursor) {
                  // 获取当前记录
                  const record = cursor.value;

                  // 添加错误历史字段（如果不存在）
                  if (!record.errorHistory) {
                    record.errorHistory = [];

                    // 如果有最后一次的错误记录，将其添加到历史记录中
                    if (record.lastUserInput && record.lastAnalysisResult) {
                      record.errorHistory.push({
                        userInput: record.lastUserInput,
                        analysisResult: record.lastAnalysisResult,
                        errorTime:
                          record.lastErrorTime || new Date().toISOString(),
                      });
                    }
                  }

                  // 更新记录
                  cursor.update(record);

                  // 继续处理下一条记录
                  cursor.continue();
                }
              };
            }

            console.log("题目错误表升级成功，添加了错误历史记录功能");
          }
        } catch (error) {
          console.error("升级题目错误表添加历史记录功能失败:", error);
          // 升级出错不阻止数据库打开，继续处理
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject("打开数据库失败: " + request.error);
  });
}

// 记录题目错误
export async function recordQuestionError(
  questionId: number,
  questionText: string,
  userInput?: string,
  analysisResult?: any
): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(["questionErrors"], "readwrite");
    const store = transaction.objectStore("questionErrors");

    // 查询是否已有记录
    const getRequest = store.get(questionId);

    getRequest.onsuccess = () => {
      const data = getRequest.result;
      const now = new Date().toISOString();

      if (data) {
        // 更新现有记录
        data.count += 1;
        data.lastErrorTime = now;

        // 如果提供了用户输入和分析结果，更新最后一次错误的详细情况
        if (userInput && analysisResult) {
          // 保存最后一次错误情况（兼容旧版本）
          data.lastUserInput = userInput;
          data.lastAnalysisResult = analysisResult;

          // 添加到错误历史记录中
          if (!data.errorHistory) {
            data.errorHistory = [];
          }

          // 添加新的错误记录
          data.errorHistory.push({
            userInput,
            analysisResult,
            errorTime: now,
          });

          // 限制历史记录数量，避免数据过大（保留最近20条）
          if (data.errorHistory.length > 20) {
            data.errorHistory = data.errorHistory.slice(-20);
          }
        }

        store.put(data);
      } else {
        // 创建新记录
        const newRecord: any = {
          id: questionId,
          text: questionText,
          count: 1,
          lastErrorTime: now,
          firstErrorTime: now,
        };

        // 如果提供了用户输入和分析结果，添加到记录中
        if (userInput && analysisResult) {
          // 保存最后一次错误情况（兼容旧版本）
          newRecord.lastUserInput = userInput;
          newRecord.lastAnalysisResult = analysisResult;

          // 创建错误历史记录
          newRecord.errorHistory = [
            {
              userInput,
              analysisResult,
              errorTime: now,
            },
          ];
        }

        store.add(newRecord);
      }
    };

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () =>
        reject("记录题目错误数据失败: " + transaction.error);
    });
  } catch (error) {
    console.error("记录题目错误失败:", error);
    throw error;
  }
}

// 分析单词错误类型
export function analyzeErrorType(
  inputWord: string,
  correctWord: string,
  originalText: string | undefined,
  userInput: string | undefined
): ErrorType {
  // 如果没有提供正确单词，返回OTHER类型
  if (!correctWord) {
    return ErrorType.OTHER;
  }

  // 如果没有提供输入单词，说明是漏词
  if (!inputWord || inputWord.trim() === "") {
    return ErrorType.MISSING_WORD;
  }

  // 明确标记为多余单词的情况
  if (correctWord === "" && inputWord && inputWord.trim() !== "") {
    console.log(`[analyzeErrorType] 明确识别多余单词: "${inputWord}"`);
    return ErrorType.EXTRA_WORD;
  }

  // 清理单词，去除标点并小写
  const cleanInput = inputWord
    .replace(/[.,!?;:"'()[\]{}]$/g, "")
    .toLowerCase()
    .trim();
  const cleanCorrect = correctWord
    .replace(/[.,!?;:"'()[\]{}]$/g, "")
    .toLowerCase()
    .trim();

  // 特殊处理: 如果正确单词是"to"，用户可能漏掉了
  if (cleanCorrect === "to" && (!userInput || !userInput.includes(" to "))) {
    return ErrorType.MISSING_WORD;
  }

  // 特殊处理: 如果用户单词是冠词"a"/"an"/"the"且原文中不需要，则为多余单词
  if (
    (cleanInput === "a" || cleanInput === "an" || cleanInput === "the") &&
    originalText &&
    !originalText.toLowerCase().includes(` ${cleanInput} `)
  ) {
    return ErrorType.EXTRA_WORD;
  }

  // 检查时态错误 - 特别处理make/made
  if (
    (cleanCorrect === "make" && cleanInput === "made") ||
    (cleanCorrect === "made" && cleanInput === "make")
  ) {
    return ErrorType.TENSE;
  }

  // 单复数错误判断
  if (
    (cleanCorrect.endsWith("s") &&
      !cleanInput.endsWith("s") &&
      cleanCorrect.slice(0, -1) === cleanInput) ||
    (!cleanCorrect.endsWith("s") &&
      cleanInput.endsWith("s") &&
      cleanCorrect === cleanInput.slice(0, -1)) ||
    (cleanCorrect === "appointment" && cleanInput === "appointments") ||
    (cleanCorrect === "appointments" && cleanInput === "appointment")
  ) {
    return ErrorType.TENSE; // 单复数错误归类为时态错误
  }

  // 检查拼写错误 - 使用编辑距离算法
  const distance = levenshteinDistance(cleanInput, cleanCorrect);

  // 拼写错误：如果编辑距离较小（少于单词长度的一半）
  if (
    distance > 0 &&
    distance <= Math.max(2, Math.ceil(cleanCorrect.length / 3))
  ) {
    return ErrorType.SPELLING;
  }

  // 分析整句上下文
  if (originalText && userInput) {
    const originalWords = originalText
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/[.,!?;:"'()[\]{}]$/g, "").toLowerCase());
    const userWords = userInput
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/[.,!?;:"'()[\]{}]$/g, "").toLowerCase());

    // 检查词序错误 - 如果单词在句子中存在但位置不同
    if (cleanInput === cleanCorrect) {
      const inputIndex = userWords.indexOf(cleanInput);
      const correctIndex = originalWords.indexOf(cleanCorrect);

      if (
        inputIndex !== -1 &&
        correctIndex !== -1 &&
        inputIndex !== correctIndex
      ) {
        return ErrorType.WORD_ORDER;
      }
    }

    // 检查多词错误 - 用户输入的单词在原文中不存在
    if (!originalWords.includes(cleanInput)) {
      console.log(`[analyzeErrorType] 检测到多余单词: ${cleanInput}`);
      return ErrorType.EXTRA_WORD;
    }
  }

  // 检查时态错误 - 常见的时态变化
  const tenseRegex = /(ed|ing|s|es|en)$/;
  if (
    (tenseRegex.test(cleanCorrect) && !tenseRegex.test(cleanInput)) ||
    (!tenseRegex.test(cleanCorrect) && tenseRegex.test(cleanInput))
  ) {
    return ErrorType.TENSE;
  }

  // 检查词性错误 - 常见的形容词/副词后缀
  const posRegex = /(ly|ive|ful|less|ous|able|ible|al|ic|ical|ish|like)$/;
  if (
    (posRegex.test(cleanCorrect) && !posRegex.test(cleanInput)) ||
    (!posRegex.test(cleanCorrect) && posRegex.test(cleanInput))
  ) {
    return ErrorType.PART_OF_SPEECH;
  }

  // 检查近似表达 - 如果没有明确分类，但距离较大，可能是近似表达
  if (distance > Math.ceil(cleanCorrect.length / 3)) {
    return ErrorType.APPROXIMATE;
  }

  // 默认返回OTHER类型
  return ErrorType.OTHER;
}

// 计算编辑距离的辅助函数
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // 初始化矩阵
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // 填充矩阵
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替换
          matrix[i][j - 1] + 1, // 插入
          matrix[i - 1][j] + 1 // 删除
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// 记录单词错误
export async function recordWordError(
  word: string,
  originalText?: string,
  userInput?: string,
  actualErrorWord?: string
): Promise<void> {
  try {
    // 处理额外单词的情况 - 如果原始单词为空但有错误单词，说明是多余单词
    if (
      (!word || word.trim() === "") &&
      actualErrorWord &&
      actualErrorWord.trim() !== ""
    ) {
      console.log(`[recordWordError] 检测到多余单词: "${actualErrorWord}"`);

      // 对于多余单词，使用错误单词作为记录主体，并标记为EXTRA_WORD类型
      const extraWord = actualErrorWord
        .replace(/[.,!?;:"'()[\]{}]$/g, "")
        .toLowerCase()
        .trim();

      if (extraWord !== "") {
        try {
          await recordExtraWord(extraWord, originalText || "", userInput || "");
          console.log(`[recordWordError] 成功记录多余单词: "${extraWord}"`);
        } catch (error) {
          console.error(`[recordWordError] 记录多余单词失败: ${error}`);
        }
      }
      return;
    }

    // 忽略空白单词或标点符号
    if (!word || word.trim() === "" || /^[.,!?;:"'()[\]{}]$/.test(word)) {
      console.log(`[recordWordError] 忽略无效单词: "${word}"`);
      return;
    }

    // 处理单词，去除末尾标点并转小写
    const cleanWord = word
      .replace(/[.,!?;:"'()[\]{}]$/g, "")
      .toLowerCase()
      .trim();
    if (cleanWord === "") {
      console.log(`[recordWordError] 清理后为空: "${word}"`);
      return;
    }

    console.log(
      `[recordWordError] 处理单词错误: "${word}" (清理后: "${cleanWord}")`
    );

    // 记录原始单词，而不是用户的错误版本
    let wordToRecord = cleanWord;
    if (originalText) {
      // 直接使用传入的单词，它应该已经是原始文本中的正确单词
      console.log(
        `[recordWordError] 直接使用原始文本中的单词: "${wordToRecord}"`
      );
    }

    // 分析错误类型
    let errorType = ErrorType.OTHER;
    if (originalText) {
      errorType = analyzeErrorType(
        actualErrorWord || "",
        wordToRecord,
        originalText,
        userInput
      );
      console.log(
        `[recordWordError] 分析错误类型: "${errorType}" (正确: "${wordToRecord}", 错误: "${
          actualErrorWord || ""
        }")`
      );
    }

    // 针对多余单词的特殊处理
    if (errorType === ErrorType.EXTRA_WORD && actualErrorWord) {
      console.log(
        `[recordWordError] 检测到多余单词(错误类型): "${actualErrorWord}"`
      );
      try {
        await recordExtraWord(
          actualErrorWord.toLowerCase().trim(),
          originalText || "",
          userInput || ""
        );
        console.log(
          `[recordWordError] 通过错误类型检测成功记录多余单词: "${actualErrorWord}"`
        );
        return;
      } catch (error) {
        console.error(
          `[recordWordError] 通过错误类型记录多余单词失败: ${error}`
        );
      }
    }

    const db = await openDB();
    const transaction = db.transaction(["wordErrors"], "readwrite");
    const store = transaction.objectStore("wordErrors");

    // 查询是否已有记录
    const getRequest = store.get(wordToRecord);

    getRequest.onsuccess = () => {
      const data = getRequest.result as WordErrorRecord;
      const now = new Date().toISOString();

      if (data) {
        // 更新现有记录
        data.count += 1;
        data.lastErrorTime = now;

        // 更新错误类型统计
        if (!data.errorTypes) {
          data.errorTypes = createInitialErrorTypes(errorType);
        } else {
          data.errorTypes[errorType] = (data.errorTypes[errorType] || 0) + 1;
        }

        // 添加错误输入历史
        if (!data.wrongInputs) {
          data.wrongInputs = [];
        }

        if (actualErrorWord) {
          data.wrongInputs.push({
            input: actualErrorWord,
            time: now,
            errorType: errorType,
          });

          // 限制历史记录数量，避免数据过大
          if (data.wrongInputs.length > 50) {
            data.wrongInputs = data.wrongInputs.slice(-50);
          }
        }

        store.put(data);
        console.log(
          `[recordWordError] 更新现有记录: "${wordToRecord}", 次数: ${data.count}, 错误类型: ${errorType}`
        );
      } else {
        // 创建新记录
        const newRecord: WordErrorRecord = {
          word: wordToRecord,
          count: 1,
          lastErrorTime: now,
          firstErrorTime: now,
          errorTypes: createInitialErrorTypes(errorType),
          wrongInputs: actualErrorWord
            ? [
                {
                  input: actualErrorWord,
                  time: now,
                  errorType: errorType,
                },
              ]
            : [],
        };

        store.add(newRecord);
        console.log(
          `[recordWordError] 创建新记录: "${wordToRecord}", 错误类型: ${errorType}`
        );
      }
    };

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        console.error(
          `[recordWordError] 记录单词错误数据失败: ${transaction.error}`
        );
        reject("记录单词错误数据失败: " + transaction.error);
      };
    });
  } catch (error) {
    console.error("[recordWordError] 记录单词错误失败:", error);
    throw error;
  }
}

// 记录多余单词
async function recordExtraWord(
  extraWord: string,
  originalText: string,
  userInput: string
): Promise<void> {
  try {
    console.log(`[recordExtraWord] 记录多余单词: "${extraWord}"`);

    // 确保单词有效
    if (!extraWord || extraWord.trim() === "") {
      console.log(`[recordExtraWord] 忽略无效的多余单词`);
      return;
    }

    const db = await openDB();
    const transaction = db.transaction(["wordErrors"], "readwrite");
    const store = transaction.objectStore("wordErrors");

    // 查询是否已有记录
    const getRequest = store.get(extraWord);
    const now = new Date().toISOString();

    getRequest.onsuccess = () => {
      const data = getRequest.result as WordErrorRecord;

      if (data) {
        // 更新现有记录
        data.count += 1;
        data.lastErrorTime = now;

        // 更新错误类型统计
        if (!data.errorTypes) {
          // 创建一个包含所有 ErrorType 的记录
          data.errorTypes = createInitialErrorTypes(ErrorType.EXTRA_WORD);
        } else {
          data.errorTypes[ErrorType.EXTRA_WORD] =
            (data.errorTypes[ErrorType.EXTRA_WORD] || 0) + 1;
        }

        // 添加错误输入历史
        if (!data.wrongInputs) {
          data.wrongInputs = [];
        }

        data.wrongInputs.push({
          input: extraWord,
          time: now,
          errorType: ErrorType.EXTRA_WORD,
        });

        // 限制历史记录数量
        if (data.wrongInputs.length > 50) {
          data.wrongInputs = data.wrongInputs.slice(-50);
        }

        store.put(data);
        console.log(
          `[recordExtraWord] 更新多余单词记录: "${extraWord}", 次数: ${data.count}`
        );
      } else {
        // 创建新记录
        const newRecord: WordErrorRecord = {
          word: extraWord,
          count: 1,
          lastErrorTime: now,
          firstErrorTime: now,
          errorTypes: createInitialErrorTypes(ErrorType.EXTRA_WORD),
          wrongInputs: [
            {
              input: extraWord,
              time: now,
              errorType: ErrorType.EXTRA_WORD,
            },
          ],
        };

        store.add(newRecord);
        console.log(`[recordExtraWord] 创建多余单词记录: "${extraWord}"`);
      }
    };

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        console.error(
          `[recordExtraWord] 记录多余单词数据失败: ${transaction.error}`
        );
        reject("记录多余单词数据失败: " + transaction.error);
      };
    });
  } catch (error) {
    console.error("[recordExtraWord] 记录多余单词失败:", error);
    throw error;
  }
}

// 获取所有题目错误记录，按错误次数降序排列
export async function getAllQuestionErrors(): Promise<any[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction(["questionErrors"], "readonly");
    const store = transaction.objectStore("questionErrors");

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result;
        // 按最近错误时间排序（降序）而不是按错误次数
        results.sort((a, b) => {
          return (
            new Date(b.lastErrorTime).getTime() -
            new Date(a.lastErrorTime).getTime()
          );
        });
        db.close();
        resolve(results);
      };

      request.onerror = () => {
        db.close();
        reject("获取题目错误记录失败: " + request.error);
      };
    });
  } catch (error) {
    console.error("获取题目错误统计失败:", error);
    throw error;
  }
}

// 获取所有单词错误记录，按错误次数降序排列
export async function getAllWordErrors(): Promise<any[]> {
  try {
    const db = await openDB();
    const transaction = db.transaction(["wordErrors"], "readonly");
    const store = transaction.objectStore("wordErrors");

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result;

        // 修复可能的数据不一致
        const fixedResults = results.map((record) => {
          // 创建一个副本以避免修改原始数据库对象
          const fixedRecord = { ...record };

          // 确保errorTypes字段存在
          if (!fixedRecord.errorTypes) {
            fixedRecord.errorTypes = {};
          }

          // 检查错误类型的总和是否与count一致
          let errorTypeSum = 0;
          for (const type in fixedRecord.errorTypes) {
            errorTypeSum += fixedRecord.errorTypes[type as ErrorType];
          }

          // 如果错误类型总和与count不一致，修复错误类型分布
          if (errorTypeSum !== fixedRecord.count && errorTypeSum > 0) {
            console.log(
              `[getAllWordErrors] 数据不一致: "${fixedRecord.word}"，总错误数为${fixedRecord.count}，但错误类型总和为${errorTypeSum}`
            );

            // 如果错误类型总和大于计数（重复计数的情况），修复计数
            if (errorTypeSum > fixedRecord.count) {
              fixedRecord.count = errorTypeSum;
              console.log(
                `[getAllWordErrors] 更新计数: "${fixedRecord.word}" 的计数从${record.count}更新为${fixedRecord.count}`
              );
            }
            // 如果错误类型总和小于计数，添加缺失的计数到OTHER类型
            else if (errorTypeSum < fixedRecord.count) {
              fixedRecord.errorTypes[ErrorType.OTHER] =
                (fixedRecord.errorTypes[ErrorType.OTHER] || 0) +
                (fixedRecord.count - errorTypeSum);
              console.log(
                `[getAllWordErrors] 添加缺失错误类型: "${
                  fixedRecord.word
                }" 添加${fixedRecord.count - errorTypeSum}个OTHER类型错误`
              );
            }
          }

          // 检查特定情况：如果是"a"且count为2，但类型是多余词，查看是否有重复
          if (fixedRecord.word === "a" && fixedRecord.count > 1) {
            console.log(
              `[getAllWordErrors] 检查可能的"a"重复记录，当前计数: ${fixedRecord.count}`
            );

            // 如果有错误输入历史，检查是否存在重复记录
            if (fixedRecord.wrongInputs && fixedRecord.wrongInputs.length > 0) {
              // 检查是否有重复记录（相同时间或几乎相同时间的记录）
              const uniqueTimes = new Set();
              const uniqueInputs = fixedRecord.wrongInputs!.filter(
                (entry: {
                  input: string;
                  time: string;
                  errorType: ErrorType;
                }) => {
                  // 仅保留时间戳到分钟的精度
                  const timeToMinute = entry.time.substring(0, 16);
                  if (uniqueTimes.has(timeToMinute)) {
                    return false; // 这是重复记录
                  }
                  uniqueTimes.add(timeToMinute);
                  return true;
                }
              );

              // 如果有重复，修复历史记录和计数
              if (uniqueInputs.length < fixedRecord.wrongInputs!.length) {
                console.log(
                  `[getAllWordErrors] 检测到重复记录: "${
                    fixedRecord.word
                  }" 历史记录从${fixedRecord.wrongInputs!.length}减少到${
                    uniqueInputs.length
                  }`
                );
                fixedRecord.wrongInputs = uniqueInputs;
                fixedRecord.count = uniqueInputs.length;

                // 同时修复错误类型计数
                if (fixedRecord.errorTypes[ErrorType.EXTRA_WORD]) {
                  fixedRecord.errorTypes[ErrorType.EXTRA_WORD] =
                    fixedRecord.count;
                }
              }
            }
          }

          return fixedRecord;
        });

        // 按错误次数排序（降序）
        fixedResults.sort((a, b) => b.count - a.count);
        db.close();
        resolve(fixedResults);
      };

      request.onerror = () => {
        db.close();
        reject("获取单词错误记录失败: " + request.error);
      };
    });
  } catch (error) {
    console.error("获取单词错误统计失败:", error);
    throw error;
  }
}

// 清除所有统计数据
export async function clearAllStatistics(): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction(
      ["questionErrors", "wordErrors", "progress"],
      "readwrite"
    );

    // 清除题目错误数据
    const questionStore = transaction.objectStore("questionErrors");
    questionStore.clear();

    // 清除单词错误数据
    const wordStore = transaction.objectStore("wordErrors");
    wordStore.clear();

    // 清除进度数据
    const progressStore = transaction.objectStore("progress");
    progressStore.clear();

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject("清除统计数据失败: " + transaction.error);
      };
    });
  } catch (error) {
    console.error("清除统计数据失败:", error);
    throw error;
  }
}

// 检查数据库是否已初始化
export async function checkDatabaseInitialized(): Promise<boolean> {
  try {
    if (!isIndexedDBAvailable()) {
      return false;
    }

    const db = await openDB();
    const initialized =
      db.objectStoreNames.contains(QUESTION_ERRORS_STORE) &&
      db.objectStoreNames.contains(WORD_ERRORS_STORE) &&
      db.objectStoreNames.contains(PROGRESS_STORE) &&
      db.objectStoreNames.contains(SHORTCUTS_STORE);
    db.close();

    if (!initialized) {
      console.error("数据库未正确初始化");
    }

    return initialized;
  } catch (error) {
    console.error("检查数据库初始化状态失败:", error);
    return false;
  }
}

// 初始化数据库（如果需要）
export async function initDatabase(): Promise<boolean> {
  try {
    if (!isIndexedDBAvailable()) {
      return false;
    }

    // 删除现有数据库并重新创建
    return new Promise((resolve) => {
      const deleteRequest = window.indexedDB.deleteDatabase(DB_NAME);

      deleteRequest.onsuccess = async () => {
        try {
          // 打开新数据库会触发onupgradeneeded事件
          const db = await openDB();
          db.close();
          resolve(true);
        } catch (error) {
          console.error("重新创建数据库失败:", error);
          resolve(false);
        }
      };

      deleteRequest.onerror = () => {
        console.error("删除数据库失败:", deleteRequest.error);
        resolve(false);
      };
    });
  } catch (error) {
    console.error("初始化数据库失败:", error);
    return false;
  }
}

// 保存答题进度
export interface DictationProgress {
  id: string; // 使用固定ID "current_progress"
  currentQuestionIndex: number; // 当前题目索引
  userAnswers: Array<string>; // 用户已回答的内容
  startTime: string; // 开始时间
  lastUpdateTime: string; // 最后更新时间
}

// 保存答题进度
export async function saveProgress(
  progress: Omit<DictationProgress, "id">
): Promise<void> {
  try {
    if (!isIndexedDBAvailable()) {
      throw new Error("IndexedDB不可用");
    }

    const db = await openDB();
    const transaction = db.transaction([PROGRESS_STORE], "readwrite");
    const store = transaction.objectStore(PROGRESS_STORE);

    // 使用固定ID保存进度
    const progressData: DictationProgress = {
      id: "current_progress", // 固定ID
      ...progress,
      lastUpdateTime: new Date().toISOString(),
    };

    store.put(progressData);

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        console.log("保存进度成功");
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject("保存进度失败: " + transaction.error);
      };
    });
  } catch (error) {
    console.error("保存答题进度失败:", error);
    throw error;
  }
}

// 获取答题进度
export async function getProgress(): Promise<DictationProgress | null> {
  try {
    if (!isIndexedDBAvailable()) {
      return null;
    }

    const db = await openDB();
    const transaction = db.transaction([PROGRESS_STORE], "readonly");
    const store = transaction.objectStore(PROGRESS_STORE);

    return new Promise((resolve, reject) => {
      const request = store.get("current_progress");

      request.onsuccess = () => {
        db.close();
        const progress = request.result;
        resolve(progress || null);
      };

      request.onerror = () => {
        db.close();
        console.error("获取进度失败:", request.error);
        reject("获取进度失败: " + request.error);
      };
    });
  } catch (error) {
    console.error("获取答题进度失败:", error);
    return null;
  }
}

// 清除答题进度
export async function clearProgress(): Promise<void> {
  try {
    if (!isIndexedDBAvailable()) {
      return;
    }

    const db = await openDB();
    const transaction = db.transaction([PROGRESS_STORE], "readwrite");
    const store = transaction.objectStore(PROGRESS_STORE);

    store.delete("current_progress");

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        console.log("清除进度成功");
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject("清除进度失败: " + transaction.error);
      };
    });
  } catch (error) {
    console.error("清除答题进度失败:", error);
    throw error;
  }
}

// 获取快捷键配置
export async function getShortcutsSettings(): Promise<ShortcutsSettings> {
  try {
    if (!isIndexedDBAvailable()) {
      console.log("IndexedDB不可用，返回默认快捷键配置");
      return createDefaultShortcutsSettings();
    }

    const db = await openDB();
    const transaction = db.transaction([SHORTCUTS_STORE], "readonly");
    const store = transaction.objectStore(SHORTCUTS_STORE);

    return new Promise((resolve, reject) => {
      const request = store.get("user_shortcuts");

      request.onsuccess = () => {
        db.close();
        const shortcuts = request.result as ShortcutsSettings;
        if (shortcuts) {
          console.log("获取快捷键配置成功:", shortcuts);
          resolve(shortcuts);
        } else {
          console.log("未找到快捷键配置，使用默认配置");
          const defaultSettings = createDefaultShortcutsSettings();
          resolve(defaultSettings);
        }
      };

      request.onerror = () => {
        db.close();
        console.error("获取快捷键配置失败:", request.error);
        // 返回默认配置
        resolve(createDefaultShortcutsSettings());
      };
    });
  } catch (error) {
    console.error("获取快捷键配置出错:", error);
    return createDefaultShortcutsSettings();
  }
}

// 保存快捷键配置
export async function saveShortcutsSettings(
  settings: Omit<ShortcutsSettings, "id" | "lastUpdateTime">
): Promise<void> {
  try {
    if (!isIndexedDBAvailable()) {
      throw new Error("IndexedDB不可用");
    }

    const db = await openDB();
    const transaction = db.transaction([SHORTCUTS_STORE], "readwrite");
    const store = transaction.objectStore(SHORTCUTS_STORE);

    // 添加固定ID和更新时间
    const shortcutsData: ShortcutsSettings = {
      id: "user_shortcuts",
      ...settings,
      lastUpdateTime: new Date().toISOString(),
    };

    store.put(shortcutsData);

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        db.close();
        console.log("保存快捷键配置成功");
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject("保存快捷键配置失败: " + transaction.error);
      };
    });
  } catch (error) {
    console.error("保存快捷键配置失败:", error);
    throw error;
  }
}

// 重置快捷键配置为默认值
export async function resetShortcutsSettings(): Promise<void> {
  try {
    const defaultSettings = createDefaultShortcutsSettings();
    await saveShortcutsSettings(defaultSettings);
    console.log("重置快捷键配置成功");
  } catch (error) {
    console.error("重置快捷键配置失败:", error);
    throw error;
  }
}

// 创建默认快捷键配置
function createDefaultShortcutsSettings(): ShortcutsSettings {
  return {
    id: "user_shortcuts",
    ...DEFAULT_SHORTCUTS,
    lastUpdateTime: new Date().toISOString(),
  };
}

// 导出数据库所有数据
export async function exportAllData(): Promise<any> {
  try {
    if (!isIndexedDBAvailable()) {
      throw new Error("IndexedDB不可用");
    }

    const db = await openDB();
    const exportData: Record<string, any[]> = {};

    // 导出所有题目错误记录
    const questionErrorsData = await getAllQuestionErrors();
    exportData[QUESTION_ERRORS_STORE] = questionErrorsData;

    // 导出所有单词错误记录
    const wordErrorsData = await getAllWordErrors();
    exportData[WORD_ERRORS_STORE] = wordErrorsData;

    // 导出进度记录
    const progressData = await getProgress();
    exportData[PROGRESS_STORE] = progressData ? [progressData] : [];

    // 导出快捷键配置
    const shortcutsData = await getShortcutsSettings();
    exportData[SHORTCUTS_STORE] = shortcutsData ? [shortcutsData] : [];

    // 包含元数据
    const metadata = {
      exportTime: new Date().toISOString(),
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
    };

    const fullExport = {
      metadata,
      data: exportData,
    };

    db.close();
    return fullExport;
  } catch (error) {
    console.error("导出数据失败:", error);
    throw new Error("导出数据失败：" + error);
  }
}

// 导入数据到数据库
export async function importAllData(importData: any): Promise<boolean> {
  try {
    if (!isIndexedDBAvailable()) {
      throw new Error("IndexedDB不可用");
    }

    // 验证导入数据格式
    if (!importData || !importData.metadata || !importData.data) {
      throw new Error("导入数据格式无效");
    }

    // 检查数据库版本兼容性
    const importVersion = importData.metadata.dbVersion;
    if (importVersion > DB_VERSION) {
      console.warn(
        `导入数据版本(${importVersion})高于当前数据库版本(${DB_VERSION})，可能存在兼容性问题`
      );
    }

    // 打开数据库
    const db = await openDB();

    // 开始导入任务，为每个存储对象创建单独的事务
    const importTasks = [];

    // 导入题目错误记录
    if (importData.data[QUESTION_ERRORS_STORE]) {
      const importQuestionErrors = new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(
          [QUESTION_ERRORS_STORE],
          "readwrite"
        );
        const store = transaction.objectStore(QUESTION_ERRORS_STORE);

        // 先清空原有数据
        store.clear();

        // 添加导入的数据
        importData.data[QUESTION_ERRORS_STORE].forEach((item: any) => {
          store.add(item);
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      importTasks.push(importQuestionErrors);
    }

    // 导入单词错误记录
    if (importData.data[WORD_ERRORS_STORE]) {
      const importWordErrors = new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([WORD_ERRORS_STORE], "readwrite");
        const store = transaction.objectStore(WORD_ERRORS_STORE);

        // 先清空原有数据
        store.clear();

        // 添加导入的数据
        importData.data[WORD_ERRORS_STORE].forEach((item: any) => {
          store.add(item);
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      importTasks.push(importWordErrors);
    }

    // 导入进度记录
    if (
      importData.data[PROGRESS_STORE] &&
      importData.data[PROGRESS_STORE].length > 0
    ) {
      const importProgress = new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([PROGRESS_STORE], "readwrite");
        const store = transaction.objectStore(PROGRESS_STORE);

        // 先清空原有数据
        store.clear();

        // 添加导入的数据
        importData.data[PROGRESS_STORE].forEach((item: any) => {
          store.add(item);
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      importTasks.push(importProgress);
    }

    // 导入快捷键配置
    if (
      importData.data[SHORTCUTS_STORE] &&
      importData.data[SHORTCUTS_STORE].length > 0
    ) {
      const importShortcuts = new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([SHORTCUTS_STORE], "readwrite");
        const store = transaction.objectStore(SHORTCUTS_STORE);

        // 先清空原有数据
        store.clear();

        // 添加导入的数据
        importData.data[SHORTCUTS_STORE].forEach((item: any) => {
          store.add(item);
        });

        transaction.oncomplete = () => {
          // 导入成功后触发自定义事件，通知其他组件快捷键已更新
          if (
            typeof window !== "undefined" &&
            importData.data[SHORTCUTS_STORE][0]
          ) {
            const event = new CustomEvent("shortcutsUpdated", {
              detail: importData.data[SHORTCUTS_STORE][0],
            });
            window.dispatchEvent(event);
            console.log("导入后触发快捷键更新事件");
          }
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      });
      importTasks.push(importShortcuts);
    }

    // 等待所有导入任务完成
    await Promise.all(importTasks);

    db.close();
    console.log("所有数据导入成功");

    // 发送导入完成事件
    if (typeof window !== "undefined") {
      const event = new CustomEvent("dataImported", {
        detail: { importTime: new Date().toISOString() },
      });
      window.dispatchEvent(event);
      console.log("触发数据导入完成事件");
    }

    return true;
  } catch (error) {
    console.error("导入数据失败:", error);
    throw new Error("导入数据失败：" + error);
  }
}

// 下载数据为JSON文件
export function downloadAsJson(
  data: any,
  filename: string = "dictation_data_export.json"
): void {
  try {
    // 创建Blob对象
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });

    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    // 添加到文档并触发点击事件
    document.body.appendChild(link);
    link.click();

    // 清理
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error("下载JSON文件失败:", error);
    throw new Error("下载JSON文件失败：" + error);
  }
}

// 使用diff-match-patch算法比较文本差异
export function compareTexts(
  correctText: string,
  userText: string
): Array<{
  word: string;
  status: "correct" | "incorrect" | "missing" | "extra";
  userWord?: string;
  position: number;
  errorType?: ErrorType;
}> {
  console.log("正确文本:", correctText);
  console.log("用户输入:", userText);

  // 规范化文本：去除多余空格，确保每个单词之间只有一个空格
  const normalizeText = (text: string) => {
    return text.trim().replace(/\s+/g, " ");
  };

  const normalizedCorrect = normalizeText(correctText);
  const normalizedUser = normalizeText(userText);

  // 提取单词数组，保留标点符号
  const correctWords = normalizedCorrect.split(" ");
  const userWords = normalizedUser.split(" ");

  // 创建正确单词集合，用于快速查找
  const correctWordsClean = new Set<string>();
  for (const word of correctWords) {
    const clean = word.replace(/[.,!?;:"'()[\]{}]$/g, "").toLowerCase();
    correctWordsClean.add(clean);
  }

  // 存储处理结果
  const result: Array<{
    word: string;
    status: "correct" | "incorrect" | "missing" | "extra";
    userWord?: string;
    position: number;
    originalIndex?: number;
    userIndex?: number;
    errorType?: ErrorType;
    matchScore?: number; // 匹配得分，用于评估匹配质量
  }> = [];

  // 预处理：跟踪已处理的用户单词索引
  const processedUserIndices = new Set<number>();

  // 第0步：特殊预处理，检测可能的额外冠词
  for (let j = 0; j < userWords.length; j++) {
    const userWord = userWords[j];
    const userClean = userWord.replace(/[.,!?;:"'()[\]{}]$/g, "").toLowerCase();

    // 检查是否是常见冠词，且在原文中不存在这个冠词
    if (
      (userClean === "a" || userClean === "an" || userClean === "the") &&
      !correctWordsClean.has(userClean)
    ) {
      // 特别检查这个位置的单词：确认是多余的冠词，而不是替换了其他词
      let definitelyExtra = true;

      // 检查这个位置是否有正确单词（如果有，可能是替换而不是额外）
      if (j < correctWords.length) {
        const correctClean = correctWords[j]
          .replace(/[.,!?;:"'()[\]{}]$/g, "")
          .toLowerCase();

        // 如果在相同位置有其他单词，这可能是替换而不是多余
        if (correctClean !== userClean && correctClean !== "") {
          definitelyExtra = false;
        }
      }

      if (definitelyExtra) {
        console.log(
          `[compareTexts] 预处理确认多余冠词: "${userWord}" 在位置 ${j}`
        );

        // 添加到结果
        result.push({
          word: userWord,
          status: "extra",
          position: j,
          userIndex: j,
          errorType: ErrorType.EXTRA_WORD,
        });

        processedUserIndices.add(j);
      }
    }
  }

  // 标记所有正确单词的原始位置和用户位置
  const correctIndices = new Map<number, number>(); // key: correctIndex, value: userIndex
  const userIndices = new Map<number, number>(); // key: userIndex, value: correctIndex
  const processedCorrectIndices = new Set<number>();

  // 第一遍：找出精确匹配的单词
  for (let i = 0; i < correctWords.length; i++) {
    const correctClean = correctWords[i]
      .replace(/[.,!?;:"'()[\]{}]$/g, "")
      .toLowerCase();

    for (let j = 0; j < userWords.length; j++) {
      if (processedUserIndices.has(j)) continue;

      const userClean = userWords[j]
        .replace(/[.,!?;:"'()[\]{}]$/g, "")
        .toLowerCase();

      if (correctClean === userClean) {
        correctIndices.set(i, j);
        userIndices.set(j, i);
        processedCorrectIndices.add(i);
        processedUserIndices.add(j);

        // 添加到结果
        result.push({
          word: correctWords[i],
          status: "correct",
          position: i,
          originalIndex: i,
          userIndex: j,
        });

        break;
      }
    }
  }

  // 第二遍：处理相似单词（处理时态变化、拼写错误等）
  // 特别关注：如"make"和"made"这样的时态变化
  const potentialMatches: Array<{
    correctIndex: number;
    userIndex: number;
    score: number;
  }> = [];

  for (let i = 0; i < correctWords.length; i++) {
    if (processedCorrectIndices.has(i)) continue;

    const correctClean = correctWords[i]
      .replace(/[.,!?;:"'()[\]{}]$/g, "")
      .toLowerCase();

    for (let j = 0; j < userWords.length; j++) {
      if (processedUserIndices.has(j)) continue;

      const userClean = userWords[j]
        .replace(/[.,!?;:"'()[\]{}]$/g, "")
        .toLowerCase();

      // 特殊处理：冠词可能是多余单词，现在已由预处理步骤处理
      if (
        (userClean === "a" || userClean === "an" || userClean === "the") &&
        !correctWordsClean.has(userClean)
      ) {
        continue; // 这种情况已在预处理中处理
      }

      // 计算相似度得分
      const editDistance = levenshteinDistance(correctClean, userClean);
      const positionDiff = Math.abs(i - j);

      // 特殊情况处理：时态相似单词如make/made
      let timeBonus = 0;
      if (
        (correctClean === "make" && userClean === "made") ||
        (correctClean === "made" && userClean === "make") ||
        (correctClean === "appointment" && userClean === "appointments") ||
        (correctClean === "appointments" && userClean === "appointment") ||
        (correctClean.slice(0, -1) === userClean.slice(0, -1) &&
          ((correctClean.endsWith("s") && !userClean.endsWith("s")) ||
            (!correctClean.endsWith("s") && userClean.endsWith("s"))))
      ) {
        timeBonus = 5; // 时态变化加分
      }

      // 计算综合得分 (越高越好)
      // 编辑距离越小、位置差异越小、时态奖励越多，得分越高
      const score =
        10 - editDistance - Math.min(3, positionDiff * 0.5) + timeBonus;

      if (score > 2) {
        // 设定阈值，只考虑相似度较高的匹配
        potentialMatches.push({
          correctIndex: i,
          userIndex: j,
          score: score,
        });
      }
    }
  }

  // 按匹配质量排序
  potentialMatches.sort((a, b) => b.score - a.score);

  // 应用最佳匹配
  for (const match of potentialMatches) {
    if (
      processedCorrectIndices.has(match.correctIndex) ||
      processedUserIndices.has(match.userIndex)
    ) {
      continue; // 跳过已处理的索引
    }

    const correctWord = correctWords[match.correctIndex];
    const userWord = userWords[match.userIndex];

    // 标记为已处理
    processedCorrectIndices.add(match.correctIndex);
    processedUserIndices.add(match.userIndex);

    // 确定错误类型
    const errorType = determineErrorType(
      correctWord,
      userWord,
      normalizedCorrect,
      normalizedUser
    );

    // 添加到结果
    result.push({
      word: correctWord,
      status: "incorrect",
      userWord: userWord,
      position: match.correctIndex,
      originalIndex: match.correctIndex,
      userIndex: match.userIndex,
      errorType: errorType,
      matchScore: match.score,
    });
  }

  // 第三遍：处理缺失单词和多余单词
  // 缺失单词 (原文中有但用户未输入的)
  for (let i = 0; i < correctWords.length; i++) {
    if (processedCorrectIndices.has(i)) continue;

    // 特殊处理：to make/made 情况
    const correctClean = correctWords[i]
      .replace(/[.,!?;:"'()[\]{}]$/g, "")
      .toLowerCase();

    if (
      correctClean === "to" &&
      i + 1 < correctWords.length &&
      correctWords[i + 1].replace(/[.,!?;:"'()[\]{}]$/g, "").toLowerCase() ===
        "make"
    ) {
      // 检查用户输入中是否有"made"
      const madeIndex = userWords.findIndex(
        (w) =>
          w.replace(/[.,!?;:"'()[\]{}]$/g, "").toLowerCase() === "made" &&
          !processedUserIndices.has(userWords.indexOf(w))
      );

      if (madeIndex !== -1) {
        // 只标记"to"为缺失，"make"将在后续处理
        result.push({
          word: correctWords[i],
          status: "missing",
          position: i,
          originalIndex: i,
          errorType: ErrorType.MISSING_WORD,
        });

        processedCorrectIndices.add(i);
        continue;
      }
    }

    // 一般缺失单词处理
    result.push({
      word: correctWords[i],
      status: "missing",
      position: i,
      originalIndex: i,
      errorType: ErrorType.MISSING_WORD,
    });

    processedCorrectIndices.add(i);
  }

  // 多余单词 (用户输入但原文中没有的)
  for (let j = 0; j < userWords.length; j++) {
    if (processedUserIndices.has(j)) continue;

    const userWord = userWords[j];
    const userClean = userWord.replace(/[.,!?;:"'()[\]{}]$/g, "").toLowerCase();

    // 确保这是真正的多余单词
    let isExtraWord = true;

    // 检查这个词是否存在于原文中的其他位置（可能是词序错误而非多余）
    if (correctWordsClean.has(userClean)) {
      // 找到原文中匹配但尚未处理的位置
      for (let i = 0; i < correctWords.length; i++) {
        if (processedCorrectIndices.has(i)) continue;

        const correctClean = correctWords[i]
          .replace(/[.,!?;:"'()[\]{}]$/g, "")
          .toLowerCase();

        if (correctClean === userClean) {
          // 这可能是词序错误而非多余单词
          isExtraWord = false;
          break;
        }
      }
    }

    if (isExtraWord) {
      result.push({
        word: userWord,
        status: "extra",
        position: j,
        userIndex: j,
        errorType: ErrorType.EXTRA_WORD,
      });

      console.log(`[compareTexts] 确认多余单词: "${userWord}" 在位置 ${j}`);
    }

    processedUserIndices.add(j);
  }

  // 按原文位置排序结果
  result.sort((a, b) => {
    const posA = a.originalIndex !== undefined ? a.originalIndex : a.position;
    const posB = b.originalIndex !== undefined ? b.originalIndex : b.position;
    return posA - posB;
  });

  // 打印多余单词检测结果
  const extraWords = result.filter((item) => item.status === "extra");
  if (extraWords.length > 0) {
    console.log(
      `[compareTexts] 最终检测到${extraWords.length}个多余单词:`,
      extraWords.map((item) => item.word).join(", ")
    );
  }

  // 移除内部使用的属性
  return result.map(
    ({ originalIndex, userIndex, matchScore, ...rest }) => rest
  );
}

// 辅助函数：确定错误类型
function determineErrorType(
  correctWord: string,
  userWord: string,
  originalText: string,
  userText: string
): ErrorType {
  // 清理单词，去除标点并小写
  const cleanCorrect = correctWord
    .replace(/[.,!?;:"'()[\]{}]$/g, "")
    .toLowerCase()
    .trim();
  const cleanUser = userWord
    .replace(/[.,!?;:"'()[\]{}]$/g, "")
    .toLowerCase()
    .trim();

  // 特殊处理冠词，避免错误分类
  if (
    (cleanUser === "a" || cleanUser === "an" || cleanUser === "the") &&
    !originalText.toLowerCase().includes(` ${cleanUser} `)
  ) {
    return ErrorType.EXTRA_WORD;
  }

  // 如果单词完全相同但位置不同，则为词序错误
  if (cleanCorrect === cleanUser) {
    return ErrorType.WORD_ORDER;
  }

  // 特殊处理 "to" 的缺失
  if (cleanCorrect === "to" && !userText.toLowerCase().includes("to ")) {
    return ErrorType.MISSING_WORD;
  }

  // 特殊处理 "make/made" 的时态错误
  if (
    (cleanCorrect === "make" && cleanUser === "made") ||
    (cleanCorrect === "made" && cleanUser === "make")
  ) {
    return ErrorType.TENSE;
  }

  // 计算编辑距离，用于判断拼写错误
  const distance = levenshteinDistance(cleanCorrect, cleanUser);

  // 检查单复数错误
  if (
    (cleanCorrect === "appointment" && cleanUser === "appointments") ||
    (cleanCorrect === "appointments" && cleanUser === "appointment") ||
    (cleanCorrect.endsWith("s") &&
      !cleanUser.endsWith("s") &&
      cleanCorrect.slice(0, -1) === cleanUser) ||
    (!cleanCorrect.endsWith("s") &&
      cleanUser.endsWith("s") &&
      cleanCorrect === cleanUser.slice(0, -1))
  ) {
    return ErrorType.TENSE; // 单复数错误归类为时态错误
  }

  // 拼写错误：如果编辑距离较小
  if (
    distance > 0 &&
    distance <= Math.max(2, Math.ceil(cleanCorrect.length / 3))
  ) {
    // 检查常见的时态变化
    const tenseRegex = /(ed|ing|s|es|en)$/;
    if (
      (tenseRegex.test(cleanCorrect) && !tenseRegex.test(cleanUser)) ||
      (!tenseRegex.test(cleanCorrect) && tenseRegex.test(cleanUser))
    ) {
      return ErrorType.TENSE;
    }

    // 检查词性变化
    const posRegex = /(ly|ive|ful|less|ous|able|ible|al|ic|ical|ish|like)$/;
    if (
      (posRegex.test(cleanCorrect) && !posRegex.test(cleanUser)) ||
      (!posRegex.test(cleanCorrect) && posRegex.test(cleanUser))
    ) {
      return ErrorType.PART_OF_SPEECH;
    }

    return ErrorType.SPELLING;
  }

  // 近似表达或同义词：如果编辑距离较大但仍有一定相关性
  if (
    distance > Math.ceil(cleanCorrect.length / 3) &&
    distance < cleanCorrect.length
  ) {
    return ErrorType.APPROXIMATE;
  }

  // 同义词检测
  if (
    Math.abs(cleanCorrect.length - cleanUser.length) <= 3 &&
    distance > cleanCorrect.length / 2
  ) {
    return ErrorType.SYNONYM;
  }

  // 默认为其他错误
  return ErrorType.OTHER;
}

// 清理重复记录
export async function cleanupDuplicateRecords(): Promise<{
  success: boolean;
  totalFixed: number;
  fixedWords: string[];
}> {
  try {
    if (!isIndexedDBAvailable()) {
      return { success: false, totalFixed: 0, fixedWords: [] };
    }

    const db = await openDB();
    const transaction = db.transaction(["wordErrors"], "readwrite");
    const store = transaction.objectStore("wordErrors");

    // 获取所有单词错误记录
    const allRecords = await new Promise<WordErrorRecord[]>(
      (resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }
    );

    console.log(
      `[cleanupDuplicateRecords] 开始清理重复记录，共${allRecords.length}条记录`
    );

    // 跟踪修复情况
    const fixedWords: string[] = [];
    let totalFixed = 0;

    // 遍历记录并修复问题
    for (const record of allRecords) {
      let needsUpdate = false;
      let fixReason = "";

      // 确保有错误类型字段
      if (!record.errorTypes) {
        const initialTypes = createInitialErrorTypes();
        initialTypes[ErrorType.OTHER] = record.count; // 把所有已有错误归为OTHER类型
        record.errorTypes = initialTypes;
        needsUpdate = true;
        fixReason += "添加缺失的错误类型; ";
      }

      // 检查错误类型总和
      let errorTypeSum = 0;
      for (const type in record.errorTypes) {
        errorTypeSum += record.errorTypes[type as ErrorType];
      }

      // 修复不一致的错误类型统计
      if (errorTypeSum !== record.count && errorTypeSum > 0) {
        if (errorTypeSum > record.count) {
          // 错误类型计数总和大于总计数 - 更新总计数
          record.count = errorTypeSum;
          needsUpdate = true;
          fixReason += `错误类型计数总和(${errorTypeSum})>总计数(${record.count}); `;
        } else {
          // 错误类型计数总和小于总计数 - 添加缺失计数到OTHER
          record.errorTypes[ErrorType.OTHER] =
            (record.errorTypes[ErrorType.OTHER] || 0) +
            (record.count - errorTypeSum);
          needsUpdate = true;
          fixReason += `错误类型计数总和(${errorTypeSum})<总计数(${record.count}); `;
        }
      }

      // 检查错误输入历史记录重复
      if (record.wrongInputs && record.wrongInputs.length > 0) {
        // 找出重复的输入记录 (基于几乎相同时间的输入)
        const uniqueTimes = new Set<string>();
        const uniqueInputs = record.wrongInputs.filter(
          (entry: { input: string; time: string; errorType: ErrorType }) => {
            // 仅保留时间戳到分钟级别的精度
            const timeToMinute = entry.time.substring(0, 16);

            // 检查这个时间是否已经存在
            if (uniqueTimes.has(timeToMinute)) {
              return false; // 这是重复项
            }

            uniqueTimes.add(timeToMinute);
            return true;
          }
        );

        // 如果发现重复，更新记录
        if (uniqueInputs.length < record.wrongInputs.length) {
          record.wrongInputs = uniqueInputs;

          // 更新计数和错误类型统计
          if (
            record.errorTypes &&
            record.errorTypes[ErrorType.EXTRA_WORD] &&
            record.errorTypes[ErrorType.EXTRA_WORD] > uniqueInputs.length
          ) {
            // 如果是多余单词，只减少多余单词类型的计数
            record.errorTypes[ErrorType.EXTRA_WORD] = uniqueInputs.length;
          }

          // 重新计算总计数
          let newCount = 0;
          for (const type in record.errorTypes) {
            newCount += record.errorTypes[type as ErrorType];
          }
          record.count = newCount;

          needsUpdate = true;
          fixReason += `移除${
            record.wrongInputs.length - uniqueInputs.length
          }个重复输入; `;
        }
      }

      // 如果记录需要更新，保存回数据库
      if (needsUpdate) {
        await new Promise<void>((resolve, reject) => {
          const updateRequest = store.put(record);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        });

        totalFixed++;
        fixedWords.push(`${record.word}(${fixReason})`);
        console.log(
          `[cleanupDuplicateRecords] 修复记录: "${record.word}" - ${fixReason}`
        );
      }
    }

    await new Promise<void>((resolve) => {
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        resolve(); // 即使有错误也继续，返回部分结果
      };
    });

    console.log(
      `[cleanupDuplicateRecords] 清理完成，修复了${totalFixed}条记录`
    );
    return {
      success: true,
      totalFixed,
      fixedWords,
    };
  } catch (error) {
    console.error("清理重复记录失败:", error);
    return {
      success: false,
      totalFixed: 0,
      fixedWords: [],
    };
  }
}
