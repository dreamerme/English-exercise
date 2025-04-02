"use client";

// 统计数据相关的IndexedDB操作工具

// 数据库名称和版本
const DB_NAME = "dictation_statistics";
const DB_VERSION = 3;

// 表名
const QUESTION_ERRORS_STORE = "questionErrors";
const WORD_ERRORS_STORE = "wordErrors";
const PROGRESS_STORE = "progress";
const SHORTCUTS_STORE = "shortcuts";

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

      // 创建快捷键配置存储表
      if (!db.objectStoreNames.contains(SHORTCUTS_STORE)) {
        db.createObjectStore(SHORTCUTS_STORE, { keyPath: "id" });
        console.log("创建快捷键配置表成功");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject("打开数据库失败: " + request.error);
  });
}

// 记录题目错误
export async function recordQuestionError(
  questionId: number,
  questionText: string
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
        store.put(data);
      } else {
        // 创建新记录
        store.add({
          id: questionId,
          text: questionText,
          count: 1,
          lastErrorTime: now,
          firstErrorTime: now,
        });
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

// 记录单词错误
export async function recordWordError(
  word: string,
  originalText?: string
): Promise<void> {
  try {
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

    const db = await openDB();
    const transaction = db.transaction(["wordErrors"], "readwrite");
    const store = transaction.objectStore("wordErrors");

    // 查询是否已有记录
    const getRequest = store.get(wordToRecord);

    getRequest.onsuccess = () => {
      const data = getRequest.result;
      const now = new Date().toISOString();

      if (data) {
        // 更新现有记录
        data.count += 1;
        data.lastErrorTime = now;
        store.put(data);
        console.log(
          `[recordWordError] 更新现有记录: "${wordToRecord}", 次数: ${data.count}`
        );
      } else {
        // 创建新记录
        store.add({
          word: wordToRecord,
          count: 1,
          lastErrorTime: now,
          firstErrorTime: now,
        });
        console.log(`[recordWordError] 创建新记录: "${wordToRecord}"`);
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

// 查找错误单词对应的正确单词
function findCorrectWord(
  errorWord: string,
  originalText: string
): string | null {
  // 将原始文本分割成单词数组
  const originalWords = originalText
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[.,!?;:"'()[\]{}]$/g, "").trim());

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

  let closestWord = null;
  let minDistance = Infinity;

  // 对每个原始单词计算编辑距离，找到最接近的单词
  for (const word of originalWords) {
    const distance = levenshteinDistance(errorWord, word);

    // 编辑距离小于等于单词长度的一半才考虑（避免过于不相似的匹配）
    const threshold = Math.max(2, Math.ceil(word.length / 3));

    if (distance < minDistance && distance <= threshold) {
      minDistance = distance;
      closestWord = word;
    }
  }

  return closestWord;
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
        // 按错误次数排序（降序）
        results.sort((a, b) => b.count - a.count);
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
        // 按错误次数排序（降序）
        results.sort((a, b) => b.count - a.count);
        db.close();
        resolve(results);
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
      ["questionErrors", "wordErrors"],
      "readwrite"
    );

    // 清除题目错误数据
    const questionStore = transaction.objectStore("questionErrors");
    questionStore.clear();

    // 清除单词错误数据
    const wordStore = transaction.objectStore("wordErrors");
    wordStore.clear();

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
