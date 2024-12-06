let treeData = null;
let editor = null;

// 主题相关代码
const THEME_KEY = 'directory-tree-theme';
const themeSelect = document.getElementById('themeSelect');

// 初始化主题
function initTheme() {
    // 从 dbStorage 获取主题设置
    const savedTheme = utools.dbStorage.getItem(THEME_KEY);
    if (savedTheme) {
        themeSelect.value = savedTheme;
        applyTheme(savedTheme);
    } else {
        // 默认跟随系统
        themeSelect.value = 'system';
        applyTheme('system');
    }
}

// 应用主题
function applyTheme(theme) {
    const isDark = theme === 'dark' || 
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    
    // 更新编辑器主题
    if (editor) {
        editor.setOption('theme', isDark ? 'monokai' : 'default');
    }
    
    // 更新主题选择器的显示值
    updateSelectTrigger('themeSelect');
    
    // 保存主题设置到 dbStorage
    utools.dbStorage.setItem(THEME_KEY, theme);
}

// 监听主题切换
themeSelect.addEventListener('change', (e) => {
    // 先应用主题，这会触发 updateSelectTrigger
    applyTheme(e.target.value);
});

// 监听系统主题变化
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (themeSelect.value === 'system') {
        applyTheme('system');
        updateSelectTrigger('themeSelect');
    }
});

// 初始化编辑器
document.addEventListener('DOMContentLoaded', () => {
    editor = CodeMirror.fromTextArea(document.getElementById('treeContainer'), {
        mode: null,
        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'monokai' : 'default',
        lineNumbers: true,
        lineWrapping: false,
        foldGutter: true,
        gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        extraKeys: {
            'Ctrl-Q': function(cm) {
                cm.foldCode(cm.getCursor());
            }
        },
        foldOptions: {
            widget: '...'
        },
        viewportMargin: Infinity,
        indentUnit: 4,
        tabSize: 4,
        scrollbarStyle: 'native'
    });

    // 设置初始内容
    editor.setValue('// 请选择文件夹以生成目录树');

    // 确保编辑器正确渲染
    editor.refresh();

    // 初始化主题
    initTheme();

    initializeSelectors();
});

// ��件夹并扫描
document.getElementById('selectFolder').addEventListener('click', () => {
    try {
        const result = utools.showOpenDialog({
            title: '选择文件夹',
            properties: ['openDirectory']
        });
        
        if (result && result.length > 0) {
            const path = result[0];
            try {
                scanDirectory(path);
            } catch (error) {
                console.error('扫描目录出错:', error);
                utools.showNotification('扫描目录时出错：' + error.message);
            }
        }
    } catch (error) {
        console.error('选择文件夹失败:', error);
        utools.showNotification('选择文件夹失败');
    }
});

// 监听过滤条件变化
document.getElementById('levelSelect').addEventListener('change', (e) => {
    updateSelectTrigger('levelSelect');
    if (treeData) {
        renderTree(treeData);
    }
});

document.getElementById('commentSeparator').addEventListener('change', (e) => {
    updateSelectTrigger('commentSeparator');
    if (treeData) {
        renderTree(treeData);
    }
});

// 扫描目录结构
function scanDirectory(path) {
    console.log('开始扫描目录:', path);
    const showHidden = document.getElementById('showHidden').checked;
    const data = window.services.scanDirectory(path, showHidden);
    console.log('扫描结果:', data);
    
    if (data) {
        treeData = data;
        treeData.path = path;
        renderTree(data);
    } else {
        console.error('生成目录树失败');
        utools.showNotification('生成目录树失败');
    }
}

// 添加格式化注释按钮的事件监听
document.getElementById('formatComments').addEventListener('click', () => {
    formatComments();
});

// 格式化注释
function formatComments() {
    const content = editor.getValue();
    if (!content) return;

    const separator = document.getElementById('commentSeparator').value;
    const lines = content.split('\n');
    let maxLength = 0;

    // 第一遍遍历：找出最长的文件名长度
    lines.forEach(line => {
        if (line.trim()) {
            const commentIndex = line.indexOf(separator);
            if (commentIndex !== -1) {
                const name = line.substring(0, commentIndex).trimEnd();
                const tabLength = [...name].reduce((acc, char) => {
                    return acc + (char.match(/[\u4e00-\u9fa5]|[\uff00-\uffff]/) ? 2 : 1);
                }, 0);
                maxLength = Math.max(maxLength, tabLength);
            } else {
                const tabLength = [...line.trimEnd()].reduce((acc, char) => {
                    return acc + (char.match(/[\u4e00-\u9fa5]|[\uff00-\uffff]/) ? 2 : 1);
                }, 0);
                maxLength = Math.max(maxLength, tabLength);
            }
        }
    });

    // 第二遍遍历：格式化每一行
    const formattedLines = lines.map(line => {
        if (!line.trim()) return line;

        const commentIndex = line.indexOf(separator);
        if (commentIndex !== -1) {
            const name = line.substring(0, commentIndex).trimEnd();
            const comment = line.substring(commentIndex).trim();
            const currentLength = [...name].reduce((acc, char) => {
                return acc + (char.match(/[\u4e00-\u9fa5]|[\uff00-\uffff]/) ? 2 : 1);
            }, 0);
            const paddingLength = maxLength - currentLength + 2;
            const padding = ' '.repeat(Math.max(2, paddingLength));
            return name + padding + comment;
        }
        return line;
    });

    editor.setValue(formattedLines.join('\n'));
    
    // 保持折叠状态
    const lineCount = editor.lineCount();
    for (let i = 0; i < lineCount; i++) {
        if (editor.isFoldable(i)) {
            editor.foldCode(i);
        }
    }

    utools.showNotification('注释格式化完成');
}

// 修改 renderTree 函数，移动对齐部分
function renderTree(data) {
    console.log('始渲树形图:', data);
    const maxLevel = parseInt(document.getElementById('levelSelect').value);
    const separator = document.getElementById('commentSeparator').value;
    
    function renderNode(node, prefix = '', isLast = true, level = 1) {
        if (!node) return '';
        
        let result = '';
        
        // 添加当前节点
        const nodePrefix = prefix + (isLast ? '└── ' : '├── ');
        result += nodePrefix + node.name + (node.comment ? ` ${separator} ` + node.comment : '') + '\n';
        
        // 处理子节点，如果未达到最大级
        if (node.children && node.children.length > 0 && (maxLevel === -1 || level < maxLevel)) {
            const childPrefix = prefix + (isLast ? '    ' : '│   ');
            node.children.forEach((child, index) => {
                const isLastChild = index === node.children.length - 1;
                result += renderNode(child, childPrefix, isLastChild, level + 1);
            });
        } else if (node.children && node.children.length > 0) {
            // 如果还有子节点但达到了最大层级，显示省略号
            const childPrefix = prefix + (isLast ? '    ' : '│   ');
            result += childPrefix + '...\n';
        }
        
        return result;
    }
    
    try {
        // 渲染整个树
        let content = data.name + (data.comment ? ` ${separator} ` + data.comment : '') + '\n';
        if (data.children && data.children.length > 0) {
            content += data.children.map((child, index) => 
                renderNode(child, '', index === data.children.length - 1)
            ).join('');
        }
        
        editor.setValue(content);
        
        // 自动折叠所有可折叠的部分
        const lineCount = editor.lineCount();
        for (let i = 0; i < lineCount; i++) {
            editor.foldCode(i);
        }
        
        console.log('渲染完');
    } catch (error) {
        console.error('渲染树形图时出错:', error);
        utools.showNotification('渲染树形图失败');
    }
}

// 添加错误处理
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Global error:', {message, source, lineno, colno, error});
    utools.showNotification('发生错误：' + message);
};

// 更新选择器显示值
function updateSelectTrigger(selectId) {
    const select = document.getElementById(selectId);
    const trigger = select.parentElement.querySelector('.selected-value');
    if (trigger && select.selectedIndex >= 0) {
        const selectedOption = select.options[select.selectedIndex];
        // 确保选中值正确设置
        trigger.textContent = selectedOption.text;
        trigger.setAttribute('data-value', selectedOption.value);
    }
}

// 初始化选择器显示值
function initializeSelectors() {
    // 初始化所有选择器的显示值
    ['levelSelect', 'commentSeparator', 'themeSelect'].forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            // 确保有默认选中值
            if (select.selectedIndex === -1 && select.options.length > 0) {
                select.selectedIndex = 0;
            }
            updateSelectTrigger(id);
        }
    });
}

// 修改显示隐藏文件的逻辑
const showHiddenBtn = document.getElementById('showHiddenBtn');
const showHiddenCheckbox = document.createElement('input');
showHiddenCheckbox.type = 'checkbox';
showHiddenCheckbox.id = 'showHidden';
showHiddenCheckbox.style.display = 'none';
document.body.appendChild(showHiddenCheckbox);

// 修改事件监听器，确保正确处理显示隐藏文件
showHiddenBtn.addEventListener('click', () => {
    showHiddenCheckbox.checked = !showHiddenCheckbox.checked;
    showHiddenBtn.classList.toggle('active');
    if (treeData && treeData.path) {
        // 添加过渡动画类
        showHiddenBtn.classList.add('transitioning');
        setTimeout(() => {
            showHiddenBtn.classList.remove('transitioning');
        }, 200);
        scanDirectory(treeData.path);
    }
});

// 导出图片功能
document.getElementById('exportImage').addEventListener('click', async () => {
    if (!editor.getValue().trim()) {
        utools.showNotification('没有可导出的内容');
        return;
    }

    try {
        // 创建临时容器
        const container = document.createElement('div');
        container.className = 'export-container';
        container.style.maxWidth = '1080px';  // 限制最大宽度
        
        // 复制编辑器内容
        const content = editor.getValue();
        const lines = content.split('\n');
        
        // 创建每一行
        lines.forEach(line => {
            if (!line.trim()) return;
            
            const lineDiv = document.createElement('div');
            lineDiv.className = 'export-line';
            
            // 处理缩进和树形符号
            const indentMatch = line.match(/^([ │├└──]+)/);
            if (indentMatch) {
                const [fullIndent] = indentMatch;
                const textContent = line.substring(fullIndent.length);
                
                const indentSpan = document.createElement('span');
                indentSpan.className = 'export-indent';
                indentSpan.textContent = fullIndent;
                lineDiv.appendChild(indentSpan);
                
                const textSpan = document.createElement('span');
                textSpan.className = 'export-text';
                textSpan.textContent = textContent;
                lineDiv.appendChild(textSpan);
            } else {
                lineDiv.textContent = line;
            }
            
            container.appendChild(lineDiv);
        });
        
        document.body.appendChild(container);

        // 获取容器实际尺寸
        const rect = container.getBoundingClientRect();
        const scale = Math.min(1080 / rect.width, 1) * window.devicePixelRatio;
        
        // 配置 html2canvas
        const canvas = await html2canvas(container, {
            backgroundColor: getComputedStyle(document.documentElement)
                .getPropertyValue('--color-bg'),
            scale: scale,  // 使用计算出的缩放比例
            logging: false,
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            useCORS: true,
            allowTaint: true,
            letterRendering: true,
            removeContainer: true
        });
        
        // 移除临时容器
        document.body.removeChild(container);
        
        // 转换为图片数据，使用 JPEG 格式并设置适中的质量
        const imageData = canvas.toDataURL('image/jpeg', 0.85);
        const binaryString = atob(imageData.split(',')[1]);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // 获取文件夹名称作为默认文件名
        const folderName = treeData ? window.services.getBasename(treeData.path) : 'directory-tree';
        
        // 弹出保存对话框
        const result = utools.showSaveDialog({
            title: '保存目录树图片',
            defaultPath: `${folderName}.jpg`,
            filters: [
                { name: 'JPEG 图片', extensions: ['jpg'] }
            ]
        });
        
        if (result) {
            window.services.saveFile(result, bytes);
            utools.showNotification('图片已保存');
        }
    } catch (error) {
        console.error('导出图片失败:', error);
        utools.showNotification('导出图片失败');
    }
}); 