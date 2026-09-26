<#
.SYNOPSIS
    项目自检 —— 零依赖，Windows PowerShell 5.1 与 PowerShell 7 均可运行。

.DESCRIPTION
    本地运行：
        powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check.ps1
        或
        npm run check

    CI 中由 .github/workflows/ci.yml 调用（windows runner + ubuntu 上的 node --check）。

    检查项：
         1. JSON 合法性
         2. 编码（UTF-8 无 BOM）
         3. 换行符（仓库内统一 LF）
         4. 末尾换行 + 无行尾空格 + 无 0 字节文件
         5. 密钥泄露
         6. 页面四件套完整性 + app.json 注册一致 + TabBar 图标存在
         7. 静态资源引用存在性
         8. 配色合规（严禁蓝紫色 —— 产品硬性约束）
         9. 埋点事件名双向校验（constants ↔ trackEvent ↔ 实际调用点）
        10. 云函数交叉校验（被调用的存在 / 没有孤儿函数 / 包结构完整）
        11. schema.js 双份一致
        12. 集合清单与《数据模型》一致
        13. 《部署指南》覆盖全部云函数
        14. README 里的数量声明与实际一致
        15. JS 语法（node --check，本机无 node 时跳过并提示）

    第 9~14 项是为了防「文档声称 A、代码里是 B」。
    这类不一致不会让程序报错，但会让读代码的人立刻失去信任，
    而本仓库的价值恰恰在于「文档和实现是同一件事」。
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$Root = Split-Path -Parent $PSScriptRoot
$problems = New-Object System.Collections.ArrayList
$notes = New-Object System.Collections.ArrayList

# 脚本自身崩掉时要能说清原因。
# 之前 CI 一直是红的，日志里只有一句 exit code 1，定位不到是哪一行；
# 这个 trap 保证下次失败时直接把异常类型和位置打出来。
# trap 内部全部包了 try/catch：trap 里再抛异常就是二次故障，比不装还糟。
trap {
    $exMsg = '<无法读取异常信息>'
    $posMsg = ''
    try { $exMsg = $_.Exception.GetType().FullName + ': ' + $_.Exception.Message } catch { }
    try { $posMsg = (($_.InvocationInfo.PositionMessage) -split "`r?`n")[0] } catch { }
    Write-Output ''
    Write-Output '  [ERROR] check.ps1 自身异常终止（问题出在检查脚本，不是项目代码）'
    Write-Output ('  ' + $exMsg)
    if ($posMsg) { Write-Output ('  位置：' + $posMsg) }
    Write-Output ''
    exit 1
}

function Add-Problem {
    param([string]$File, [string]$Message)
    [void]$problems.Add([pscustomobject]@{ File = $File; Message = $Message })
}
function Add-Note { param([string]$Text) [void]$notes.Add($Text) }
function Get-Rel { param([string]$Path) return $Path.Substring($Root.Length + 1) }

function Read-Text {
    param([string]$Path)
    return [System.IO.File]::ReadAllText($Path, (New-Object System.Text.UTF8Encoding($false)))
}

# 取得小写扩展名；无扩展名（LICENSE、.gitignore）返回空串
function Get-Ext {
    param([string]$Path)
    $name = Split-Path -Leaf $Path
    # 以点开头且没有第二个点，视作 dotfile（无扩展名）
    if ($name.StartsWith('.') -and $name.IndexOf('.', 1) -lt 0) { return '' }
    $idx = $name.LastIndexOf('.')
    if ($idx -lt 0) { return '' }
    return $name.Substring($idx).ToLower()
}

# ---------------------------------------------------------------- 遍历
$skipDirs = @('.git', 'node_modules', 'miniprogram_npm', 'dist', '.idea', '.vscode', 'coverage')
$textExt  = @('.js', '.json', '.wxml', '.wxss', '.md', '.yml', '.yaml', '.ps1')

function Get-AllFiles {
    param([string]$Dir)
    $result = @()
    # 注意：此处不能用 -Recurse，否则子目录的文件会被重复收集
    foreach ($item in (Get-ChildItem -LiteralPath $Dir -Force)) {
        $leaf = Split-Path -Leaf $item.FullName
        if ($item.PSIsContainer) {
            if ($skipDirs -contains $leaf) { continue }
            $result += Get-AllFiles -Dir $item.FullName
        } else {
            $result += $item.FullName
        }
    }
    return $result
}

$allFiles = Get-AllFiles -Dir $Root
$textFiles = @($allFiles | Where-Object { $textExt -contains (Get-Ext $_) })
$jsFiles = @($allFiles | Where-Object { (Get-Ext $_) -eq '.js' })
$utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)

# ---------------------------------------------------------------- 1~5 文本规范
$secretRules = @(
    @{ re = '-----BEGIN [A-Z ]*PRIVATE KEY-----'; label = '私钥' }
    @{ re = '\bsk-[A-Za-z0-9]{20,}';                   label = 'OpenAI 风格 API Key' }
    @{ re = '\bgh[pousr]_[A-Za-z0-9]{20,}';            label = 'GitHub Token' }
    @{ re = '\bAKIA[0-9A-Z]{16}\b';                    label = 'AWS Access Key' }
    @{ re = '\bxox[baprs]-[A-Za-z0-9-]{10,}';          label = 'Slack Token' }
    @{ re = '\bAIza[0-9A-Za-z_-]{30,}';                label = 'Google API Key' }
    @{ re = '\bwx[0-9a-f]{16}\b';                      label = '微信 AppID' }
    @{ re = '\bcloud1-[0-9a-z]{8,}';                   label = '云开发环境 ID' }
    @{ re = '\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.'; label = 'JWT' }
)

# 已知的、允许保留 AppID 与云环境 ID 的文件
$secretExempt = @('project.config.json', 'miniprogram\app.js')

# 明显的占位符（全 0 / 全 x），文档里用来示意"填你自己的"
function Test-Placeholder {
    param([string]$Value)
    if ($Value -match '^wx0+$')      { return $true }
    if ($Value -match '^cloud1-x+$') { return $true }
    return $false
}

# ---------------------------------------------------------------- 配色工具
# 扫描前先去掉注释。颜色出现在注释里（例如「这里原本抄了 Bootstrap 的
# #d1ecf1」）不是界面用色，不该被当成违规。
function Remove-Comments {
    param([string]$Text, [string]$Ext)
    $t = [regex]::Replace($Text, '/\*[\s\S]*?\*/', ' ')
    if ($Ext -eq '.wxss') {
        # WXSS 没有字符串字面量，可以安全地按行去掉 // 注释
        $t = [regex]::Replace($t, '(?m)//.*$', ' ')
    }
    return $t
}

function Remove-JsComments {
    # 剥掉 JS 注释，但必须先保护字符串字面量。
    #
    # 为什么不能直接按行去掉 // ：JS 里 'https://x' 这种串很常见，
    # 按行剥会把代码从 // 之后整段截断，检查结果就成了假的。
    # Remove-Comments 只对 .wxss 做按行剥（那里没有字符串字面量），
    # 本函数专门给需要扫 JS 代码结构的检查用。
    #
    # 做法：用一个交替式正则同时匹配「字符串」和「注释」，
    # 匹配到字符串原样返回，匹配到注释替换成空格。
    # 字符串分支排除了换行，这样即使遇到未闭合的引号也不会吞掉整个文件
    # （未闭合引号属于语法错误，交给 CI 的 node --check 报）。
    #
    # 行注释分支前缀 (?<!\\)：正则字面量 /\/\//g 里末尾那两个斜杠
    # 前面紧跟一个反斜杠，没有这条断言会被当成行注释，
    # 把该行后半段整个截断——包括真正要扫的写操作。
    #
    # 已知局限：除法与正则的歧义无法只靠正则彻底消除
    # （区分 a / b / c 与 /ab/.test(s) 需要真正的词法分析）。
    # 本项目 miniprogram/ 下唯一含 // 的地方是真实注释，
    # 三个正则字面量（search.js / format.js）内部也没有 // 相邻。
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return $Text }
    $pattern = '(?s)''(?:\\.|[^''\\\r\n])*''|"(?:\\.|[^"\\\r\n])*"|`(?:\\.|[^`\\])*`|(?<!\\)//[^\r\n]*|/\*.*?\*/'
    $evaluator = {
        param($m)
        $v = $m.Value
        # 字符串字面量：原样保留。正则字面量（/.../）不在分支里，
        # 会被当成普通文本——已知局限，见第 16 项注释。
        if ($v.Length -gt 0 -and ($v[0] -eq "'" -or $v[0] -eq '"' -or $v[0] -eq '`')) { return $v }
        return ' '
    }
    return [regex]::Replace($Text, $pattern, $evaluator)
}

function Get-HueFromRgb {
    param([int]$R, [int]$G, [int]$B)
    # 必须在归一化之后再比大小。PowerShell 变量名不区分大小写，
    # 如果拿 0~255 的 int 和 0~1 的 double 比，条件永远不成立，
    # 所有颜色都会掉进 else 分支被判成蓝紫。
    $r = $R / 255.0; $g = $G / 255.0; $b = $B / 255.0
    $max = [Math]::Max($r, [Math]::Max($g, $b))
    $min = [Math]::Min($r, [Math]::Min($g, $b))
    $d = $max - $min
    if ($d -eq 0) { return $null }
    if ($max -eq $r)      { $h = 60 * ((($g - $b) / $d) % 6) }
    elseif ($max -eq $g)  { $h = 60 * (($b - $r) / $d + 2) }
    else                 { $h = 60 * (($r - $g) / $d + 4) }
    return ($h + 360) % 360
}

# 通道差小于该阈值时色相没有意义（视觉上是灰）。
# 不设这道闸门的话 rgb(200,200,210) 这种中性灰会因为浮点误差被判成蓝紫。
$MIN_CHROMA = 20

# 返回违规色相（整数），合规或无色相时返回 $null
function Test-BlueViolet {
    param([int]$R, [int]$G, [int]$B)
    $chroma = [Math]::Max($R, [Math]::Max($G, $B)) - [Math]::Min($R, [Math]::Min($G, $B))
    if ($chroma -lt $MIN_CHROMA) { return $null }
    $hue = Get-HueFromRgb -R $R -G $G -B $B
    if ($null -eq $hue) { return $null }
    if ($hue -ge 200 -and $hue -le 320) { return [Math]::Round($hue) }
    return $null
}

function Convert-HexToRgb {
    param([string]$Hex)
    if ($Hex.Length -eq 4) {
        # 3 位 hex 要先展开成 6 位：#abc -> #aabbcc
        $c = $Hex.Substring(1).ToCharArray()
        return @(
            [Convert]::ToInt32("$($c[0])$($c[0])", 16),
            [Convert]::ToInt32("$($c[1])$($c[1])", 16),
            [Convert]::ToInt32("$($c[2])$($c[2])", 16)
        )
    }
    return @(
        [Convert]::ToInt32($Hex.Substring(1, 2), 16),
        [Convert]::ToInt32($Hex.Substring(3, 2), 16),
        [Convert]::ToInt32($Hex.Substring(5, 2), 16)
    )
}

$styleExts = @('.wxss', '.wxml', '.json', '.js')
$blueViolet = 0
foreach ($f in ($textFiles | Where-Object { $styleExts -contains (Get-Ext $_) })) {
    $ext = Get-Ext $f
    $text = Remove-Comments (Read-Text $f) $ext
    $candidates = @()

    # 6 位优先，3 位次之；末尾用负向前瞻防止把 #aabbcc 拆成 #aab
    foreach ($m in [regex]::Matches($text, '#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])')) {
        $rgb = Convert-HexToRgb $m.Value
        $candidates += ,@($m.Value, $rgb[0], $rgb[1], $rgb[2])
    }
    foreach ($m in [regex]::Matches($text, 'rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})')) {
        $R = [int]$m.Groups[1].Value
        $G = [int]$m.Groups[2].Value
        $B = [int]$m.Groups[3].Value
        if ($R -gt 255 -or $G -gt 255 -or $B -gt 255) { continue }
        $candidates += ,@($m.Value, $R, $G, $B)
    }

    foreach ($c in $candidates) {
        $hue = Test-BlueViolet -R $c[1] -G $c[2] -B $c[3]
        if ($null -eq $hue) { continue }
        Add-Problem $f ("违反配色约束：{0} 属蓝紫色相（{1}°）—— 见 docs/设计规范.md" -f $c[0], $hue)
        $blueViolet++
    }
}
if ($blueViolet -eq 0) { Add-Note '配色检查通过：未发现蓝紫色（含 3 位 hex 与 rgb()）' }

foreach ($f in $textFiles) {
    $r = Get-Rel $f
    # project.private.config.json 已被 .gitignore 排除，不纳入检查
    if ($r -eq 'project.private.config.json') { continue }
    $ext = Get-Ext $f
    $bytes = [System.IO.File]::ReadAllBytes($f)

    # 4a. 0 字节文件
    if ($bytes.Length -eq 0) {
        Add-Problem $f '文件为 0 字节（曾出现过 8 个 0 字节 TabBar 图标，导致图标区一片空白）'
        continue
    }

    # 2. BOM
    #    .ps1 例外：Windows PowerShell 5.1 在中文系统上必须靠 BOM 判定 UTF-8，
    #    否则脚本内的中文字符串字面量会被按 GBK 读成乱码并导致语法错误。
    if ($ext -ne '.ps1' -and $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        Add-Problem $f '文件含 UTF-8 BOM，应移除'
    }

    # 解码（非 UTF-8 会抛异常）
    try   { $text = $utf8Strict.GetString($bytes) }
    catch { Add-Problem $f '不是合法 UTF-8 编码'; continue }

    # 3. CRLF
    if ($text.Contains("`r`n")) { Add-Problem $f '含 CRLF 换行符，仓库内应统一 LF' }

    # 4b. 末尾换行 + 行尾空格
    if (-not $text.EndsWith("`n")) { Add-Problem $f '文件末尾缺少换行' }
    if ($ext -ne '.md') {
        $lines = $text -split "`r?`n"
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match '[ \t]+$') { Add-Problem $f ("第 {0} 行有行尾空格" -f ($i + 1)) }
        }
    }

    # 5. 密钥
    if ($secretExempt -notcontains $r) {
        foreach ($rule in $secretRules) {
            $m = [regex]::Match($text, $rule.re)
            if (-not $m.Success) { continue }
            if (Test-Placeholder $m.Value) { continue }
            $snippet = $m.Value
            if ($snippet.Length -gt 12) { $snippet = $snippet.Substring(0, 12) + '...' }
            Add-Problem $f ("疑似{0}：{1}" -f $rule.label, $snippet)
        }
    }
}

# ---------------------------------------------------------------- 1. JSON 合法性
# 这里刻意不用 System.Web.Extensions 的 JavaScriptSerializer。
# 那个程序集属于 .NET Framework，只在 Windows PowerShell 5.1 的 GAC 里；
# PowerShell 7 是 .NET 运行时，Add-Type 会直接抛「找不到程序集」，
# 而本脚本 $ErrorActionPreference = 'Stop'，于是当场终止、退出码非 0。
# 后果是本地（5.1）永远全绿、CI（pwsh 7）永远红，而这个红从第一个 commit 起
# 就存在，看起来像项目有问题，其实是检查脚本选错了 API。
#
# 改用 ConvertFrom-Json：5.1 与 7 都有。但两者的返回类型不同 ——
#   5.1      -> PSCustomObject，不能用 ['key'] 索引（会抛 CannotIndex）
#   6.0 以上 -> -AsHashtable 可用，返回 hashtable
# 后面第 6 项要按 key 取 pages / tabBar，所以统一递归归一化成 hashtable。
function ConvertTo-HashtableDeep {
    param($InputObject)
    if ($null -eq $InputObject) { return $null }
    if ($InputObject -is [System.Collections.IDictionary]) {
        $h = @{}
        foreach ($k in $InputObject.Keys) { $h[$k] = ConvertTo-HashtableDeep $InputObject[$k] }
        return $h
    }
    if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
        $h = @{}
        foreach ($p in $InputObject.PSObject.Properties) { $h[$p.Name] = ConvertTo-HashtableDeep $p.Value }
        return $h
    }
    # 用 -isnot [string] 排除字符串，否则每个字符串都会被逐字符拆开
    if (($InputObject -is [System.Collections.IEnumerable]) -and ($InputObject -isnot [string])) {
        $list = @()
        foreach ($item in $InputObject) { $list += ,(ConvertTo-HashtableDeep $item) }
        # 前导逗号：防止返回数组时被管道展开，单元素数组会退化成标量
        return ,$list
    }
    return $InputObject
}

function ConvertFrom-JsonCompat {
    param([string]$Text)
    # 刻意只依赖 -AsHashtable 这一个参数：它在 6.0 引入后到 7.x 一直稳定。
    # 不加 -Depth 之类的可选参数 —— 少一个跨版本差异，就少一个「本地绿、CI 红」的机会。
    if ($PSVersionTable.PSVersion.Major -ge 6) {
        return ($Text | ConvertFrom-Json -AsHashtable)
    }
    return ($Text | ConvertFrom-Json)
}

$appJson = $null
$appJsonPath = Join-Path $Root 'miniprogram\app.json'
$jsonCount = 0
$jsonBad = 0

foreach ($f in ($allFiles | Where-Object { $_.ToLower().EndsWith('.json') })) {
    $text = Read-Text $f
    if ($text.Trim().Length -eq 0) {
        $jsonBad++
        Add-Problem $f 'JSON 文件为空'
        continue
    }
    try   { $parsed = ConvertFrom-JsonCompat $text }
    catch {
        # Windows PowerShell 5.1 的解析异常会把整个文件内容塞进 Message，
        # 直接打印等于往报告里糊 60 行 app.json。两个版本都只取首行并限长。
        $msg = ($_.Exception.Message -split "`r?`n")[0]
        if ($msg.Length -gt 160) { $msg = $msg.Substring(0, 160) + '...' }
        $jsonBad++
        Add-Problem $f ('JSON 解析失败：' + $msg)
        continue
    }
    $jsonCount++
    if ($f -eq $appJsonPath) { $appJson = ConvertTo-HashtableDeep $parsed }
}
# 有解析失败时不要再说「通过」——那正是这份脚本一直在犯的错：
# 报告看着干净，实际上一项都没查成。
if ($jsonBad -eq 0) { Add-Note ("JSON 检查通过：{0} 个文件" -f $jsonCount) }

# ---------------------------------------------------------------- 6. 页面完整性
$pageDirs = @()
if ($null -eq $appJson) {
    # app.json 解析不出来时第 6 项形同虚设：会安静地一个页面都不检查。
    # 这里必须显式报错，不能让它退化成「什么都没查但显示通过」。
    Add-Problem $appJsonPath 'app.json 未能解析，页面注册与 TabBar 检查全部跳过'
} else {
    $mpRoot = Join-Path $Root 'miniprogram'
    $registered = @()
    $pageList = @($appJson['pages'] | Where-Object { $null -ne $_ })
    if ($pageList.Count -eq 0) { Add-Problem $appJsonPath 'app.json 的 pages 为空或缺失' }
    foreach ($page in $pageList) {
        $registered += $page
        foreach ($e in @('.js', '.json', '.wxml', '.wxss')) {
            $p = Join-Path $mpRoot ($page + $e)
            if (-not (Test-Path -LiteralPath $p)) { Add-Problem $p ("页面 {0} 缺少 {1} 文件" -f $page, $e) }
        }
    }

    $pagesDir = Join-Path $mpRoot 'pages'
    if (Test-Path -LiteralPath $pagesDir) {
        $pageDirs = @(Get-ChildItem -LiteralPath $pagesDir -Directory)
        foreach ($d in $pageDirs) {
            $rel = "pages/$($d.Name)/$($d.Name)"
            if ($registered -notcontains $rel) { Add-Problem $d.FullName ("页面未在 app.json 中注册：{0}" -f $rel) }
        }
    }

    # TabBar 图标存在性
    $tabBar = $appJson['tabBar']
    if ($null -ne $tabBar -and $null -ne $tabBar['list']) {
        $i = 0
        foreach ($item in $tabBar['list']) {
            $i++
            foreach ($key in @('iconPath', 'selectedIconPath')) {
                if ($null -eq $item[$key]) { continue }
                $p = Join-Path $mpRoot $item[$key]
                if (-not (Test-Path -LiteralPath $p)) {
                    Add-Problem $p ("TabBar 第 {0} 项的 {1} 指向不存在的文件：{2}" -f $i, $key, $item[$key])
                }
            }
        }
    }
}

# ---------------------------------------------------------------- 7. 静态资源引用
foreach ($f in ($textFiles | Where-Object { $_.ToLower() -match '\.(wxss|wxml|json)$' })) {
    $text = Read-Text $f
    $baseDir = Split-Path -Parent $f
    foreach ($m in [regex]::Matches($text, '(?:url\(|src\s*=\s*")([^"'')]+)')) {
        $ref = $m.Groups[1].Value.Trim()
        if (-not $ref) { continue }
        if ($ref -match '^(data:|https?:|//|/)') { continue }
        # WXML 模板表达式是运行时绑定，不是静态路径
        if ($ref -match '\{\{') { continue }
        if (-not (Test-Path -LiteralPath (Join-Path $baseDir $ref))) {
            Add-Problem $f ("引用的资源不存在：{0}" -f $ref)
        }
    }
}

# ---------------------------------------------------------------- 9. 埋点事件名双向校验
$constantsPath = Join-Path $Root 'miniprogram\utils\constants.js'
$trackFnPath = Join-Path $Root 'cloudfunctions\trackEvent\index.js'

function Get-JsStringArray {
    param([string]$Text, [string]$ConstName)
    $pattern = 'const\s+' + [regex]::Escape($ConstName) + '\s*=\s*\[([\s\S]*?)\]'
    $m = [regex]::Match($Text, $pattern)
    if (-not $m.Success) { return $null }
    $out = @()
    foreach ($item in [regex]::Matches($m.Groups[1].Value, "'([a-z][a-z0-9_]*)'")) {
        $out += $item.Groups[1].Value
    }
    return $out
}

if (-not (Test-Path -LiteralPath $constantsPath)) {
    Add-Problem $constantsPath '缺少埋点事件白名单定义（miniprogram/utils/constants.js）'
} elseif (-not (Test-Path -LiteralPath $trackFnPath)) {
    Add-Problem $trackFnPath '缺少埋点上报云函数'
} else {
    $declared = @(Get-JsStringArray (Read-Text $constantsPath) 'TRACK_EVENTS')
    $whitelist = @(Get-JsStringArray (Read-Text $trackFnPath) 'EVENT_WHITELIST')

    if ($declared.Count -eq 0) {
        Add-Problem $constantsPath '无法从 constants.js 解析出 TRACK_EVENTS，检查是否被改名或改写'
    }
    if ($whitelist.Count -eq 0) {
        Add-Problem $trackFnPath '无法从 trackEvent/index.js 解析出 EVENT_WHITELIST'
    }

    # 白名单两侧必须完全一致。客户端多一个名字 = 上报后被服务端静默丢弃，
    # 服务端多一个名字 = 指标体系里存在一个永远不会有数据的事件
    $onlyDeclared = @($declared | Where-Object { $whitelist -notcontains $_ })
    $onlyWhitelist = @($whitelist | Where-Object { $declared -notcontains $_ })
    foreach ($n in $onlyDeclared) {
        Add-Problem $constantsPath ("事件 {0} 只在客户端白名单里，trackEvent 的 EVENT_WHITELIST 里没有 —— 会被服务端静默丢弃" -f $n)
    }
    foreach ($n in $onlyWhitelist) {
        Add-Problem $trackFnPath ("事件 {0} 只在服务端白名单里，utils/constants.js 里没有 —— 客户端永远上报不了" -f $n)
    }

    # 实际调用点
    $used = @{}
    foreach ($f in ($jsFiles | Where-Object { $_.StartsWith((Join-Path $Root 'miniprogram')) })) {
        $text = Read-Text $f
        foreach ($m in [regex]::Matches($text, "\btrack\.(?:track|once)\(\s*'([a-z][a-z0-9_]*)'")) {
            $name = $m.Groups[1].Value
            if ($declared -notcontains $name) {
                Add-Problem $f ("埋点事件 {0} 不在 utils/constants.js 的 TRACK_EVENTS 内，上报会被丢弃" -f $name)
            } else {
                $used[$name] = $true
            }
        }
    }
    # 反向：白名单里的事件必须有人用，否则它是一条凭空存在的指标
    foreach ($n in $declared) {
        if (-not $used.ContainsKey($n)) {
            Add-Problem $constantsPath ("事件 {0} 已登记但代码里没有任何调用点 —— 指标体系里会多出一个永远为 0 的指标" -f $n)
        }
    }

    Add-Note ("埋点检查通过：{0} 个事件，客户端与服务端白名单一致，且每个都有调用点" -f $declared.Count)
}

# ---------------------------------------------------------------- 10. 云函数交叉校验
$cfRoot = Join-Path $Root 'cloudfunctions'
$cfDirs = @()
if (Test-Path -LiteralPath $cfRoot) {
    $cfDirs = @(Get-ChildItem -LiteralPath $cfRoot -Directory | Select-Object -ExpandProperty Name)
}

$called = @{}
foreach ($f in $jsFiles) {
    $text = Read-Text $f
    # 只在 callFunction({ ... }) 的参数对象里找 name: 'xxx'
    foreach ($m in [regex]::Matches($text, "(?s)callFunction\(\s*\{(.{0,300}?)\}\s*\)")) {
        $n = [regex]::Match($m.Groups[1].Value, "name\s*:\s*'([A-Za-z][A-Za-z0-9_]*)'")
        if ($n.Success) { $called[$n.Groups[1].Value] = $true }
    }
}

foreach ($name in $called.Keys) {
    if ($cfDirs -notcontains $name) {
        Add-Problem $cfRoot ("代码调用了云函数 {0}，但 cloudfunctions 下没有同名目录，调用必然失败" -f $name)
    }
}
foreach ($name in $cfDirs) {
    if (-not $called.ContainsKey($name)) {
        Add-Problem (Join-Path $cfRoot $name) ("云函数 {0} 没有任何页面调用它 —— 要么是死代码，要么调用点已删" -f $name)
    }
    # 包结构：云函数按目录独立部署，缺一个文件都会在真机上才暴露
    foreach ($need in @('index.js', 'package.json', 'config.json')) {
        $p = Join-Path (Join-Path $cfRoot $name) $need
        if (-not (Test-Path -LiteralPath $p)) { Add-Problem $p ("云函数 {0} 缺少 {1}" -f $name, $need) }
    }
    $pkgPath = Join-Path (Join-Path $cfRoot $name) 'package.json'
    if (Test-Path -LiteralPath $pkgPath) {
        $pkgText = Read-Text $pkgPath
        if ($pkgText -notmatch 'wx-server-sdk') {
            Add-Problem $pkgPath ("云函数 {0} 的 package.json 未声明 wx-server-sdk 依赖" -f $name)
        }
    }
}
Add-Note ("云函数检查通过：{0} 个函数，调用点与目录一一对应" -f $cfDirs.Count)

# ---------------------------------------------------------------- 11. schema.js 双份一致
# 云函数按目录独立部署，引用不了仓库根的公共文件，
# 所以 publishProject 与 updateProject 各存了一份，必须逐字节相同。
$schemaA = Join-Path $Root 'cloudfunctions\publishProject\schema.js'
$schemaB = Join-Path $Root 'cloudfunctions\updateProject\schema.js'
if ((Test-Path -LiteralPath $schemaA) -and (Test-Path -LiteralPath $schemaB)) {
    $ha = (Get-FileHash -LiteralPath $schemaA -Algorithm SHA256).Hash
    $hb = (Get-FileHash -LiteralPath $schemaB -Algorithm SHA256).Hash
    if ($ha -ne $hb) {
        Add-Problem $schemaB '与 publishProject/schema.js 不一致。两个云函数各自部署，只能各留一份，必须同步修改'
    } else {
        Add-Note '字段白名单检查通过：两份 schema.js 完全一致'
    }
}

# ---------------------------------------------------------------- 12~14 文档与代码一致性
# 集合清单以代码为准：谁被 db.collection('x') 打开过，谁就是一个真实存在的集合
$codeCollections = @{}
foreach ($f in $jsFiles) {
    $text = Read-Text $f
    foreach ($m in [regex]::Matches($text, "collection\(\s*'([a-z][a-z0-9_]*)'")) {
        $codeCollections[$m.Groups[1].Value] = $true
    }
}
$collectionList = @($codeCollections.Keys | Sort-Object)

$modelPath = Join-Path $Root 'docs\数据模型.md'
if (Test-Path -LiteralPath $modelPath) {
    $modelText = Read-Text $modelPath
    foreach ($c in $collectionList) {
        if ($modelText -notmatch ('`' + [regex]::Escape($c) + '`')) {
            Add-Problem $modelPath ("集合 {0} 在代码里被使用，但《数据模型》没有收录" -f $c)
        }
    }
    foreach ($m in [regex]::Matches($modelText, '(?m)^###\s+\d+\.\s+`([a-z_]+)`')) {
        $c = $m.Groups[1].Value
        if (-not $codeCollections.ContainsKey($c)) {
            Add-Problem $modelPath ("《数据模型》记载了集合 {0}，但代码里没有任何地方读写它" -f $c)
        }
    }
    Add-Note ("数据模型检查通过：{0} 个集合与代码一致" -f $collectionList.Count)
} else {
    Add-Problem $modelPath '缺少《数据模型》文档'
}

$deployPath = Join-Path $Root 'docs\部署指南.md'
if (Test-Path -LiteralPath $deployPath) {
    $deployText = Read-Text $deployPath
    foreach ($name in $cfDirs) {
        if ($deployText -notmatch ('`' + [regex]::Escape($name) + '`')) {
            Add-Problem $deployPath ("云函数 {0} 在《部署指南》中没有出现，照着文档部署会漏掉它" -f $name)
        }
    }
    foreach ($c in $collectionList) {
        if ($deployText -notmatch ('`' + [regex]::Escape($c) + '`')) {
            Add-Problem $deployPath ("集合 {0} 没有出现在《部署指南》的建表清单里，部署后页面会报 collection not exists" -f $c)
        }
    }
} else {
    Add-Problem $deployPath '缺少《部署指南》文档'
}

# README 里的「N 个页面 / N 个云函数 / N 个集合」必须等于实际数量。
# 这条检查是为了防 README 里出现 8 个云函数、实际 12 个这种最伤可信度的偏差。
$readmePath = Join-Path $Root 'README.md'
if (Test-Path -LiteralPath $readmePath) {
    $readmeText = Read-Text $readmePath
    $nounMap = @{
        '页面' = $pageDirs.Count
        '云函数' = $cfDirs.Count
        '函数' = $cfDirs.Count
        '集合' = $collectionList.Count
        '事件' = 0   # 事件数由第 9 项单独校验，这里不重复
    }
    foreach ($m in [regex]::Matches($readmeText, '(\d+)\s*个(页面|云函数|函数|集合|事件)')) {
        $noun = $m.Groups[2].Value
        if ($nounMap.ContainsKey($noun) -and $nounMap[$noun] -gt 0) {
            $claimed = [int]$m.Groups[1].Value
            $actual = $nounMap[$noun]
            if ($claimed -ne $actual) {
                Add-Problem $readmePath ("README 声称 {0} 个{1}，实际是 {2} 个" -f $claimed, $noun, $actual)
            }
        }
    }
}

# ---------------------------------------------------------------- 15. JS 语法
$node = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $node) {
    Add-Note '未检测到 node，跳过 JS 语法检查（CI 的 ubuntu runner 上会强制执行 node --check）'
} else {
    $syntaxBad = 0
    foreach ($f in $jsFiles) {
        $out = & $node.Source --check $f 2>&1
        if ($LASTEXITCODE -ne 0) {
            Add-Problem $f ('JS 语法错误：' + ($out | Out-String).Trim())
            $syntaxBad++
        }
    }
    if ($syntaxBad -eq 0) {
        Add-Note ("JS 语法检查通过：{0} 个文件" -f $jsFiles.Count)
    }
}

# ---------------------------------------------------------------- 16. 客户端写操作白名单
# 这项检查的由来是一个真实的漏修：users 集合当时配「仅创建者可写」，
# 而 updateProfile 的字段白名单只约束了「走哪个入口」，
# 调试器里 db.collection('users').doc(自己).update({isVip:true}) 照样生效。
# 代码层做了校验，权限层没做约束——而 SECURITY.md 已经写了「已修复」。
#
# 因此这里不问「有没有校验」，问「除了预期入口，还有没有别的路能写」：
# 把 miniprogram/ 下所有写操作逐个枚举出来，
# 核对它是否落在《数据模型》权限总表声明为「客户端可写」的集合里。
#
# 已知局限（刻意写明，避免把有限的检查当成无限的保证）：
#   - 只认 collection('x') 字面量。写成变量别名再 update 的形式查不出来。
#   - 写入窗口取「本次 collection( 到下一次 collection( 之间」。
#     跨集合的链式写法可能落不进窗口。
#   - 读操作不受约束。这里只管写。
$permRows = @{}
if (Test-Path -LiteralPath $modelPath) {
    $modelText2 = Read-Text $modelPath
    # 匹配权限总表的行：| 序号 | `集合` | 用途 | 写入方 | 客户端可写 |
    $rowRe = '(?m)^\|\s*\d+\s*\|\s*`([a-z][a-z0-9_]*)`\s*\|[^|]*\|[^|]*\|\s*([^|]*?)\s*\|'
    foreach ($m in [regex]::Matches($modelText2, $rowRe)) {
        # 最后一列含「否」即视为客户端不可写（否 / **否（硬约束）** 都算）
        $permRows[$m.Groups[1].Value] = ($m.Groups[2].Value -notmatch '否')
    }
    if ($permRows.Count -eq 0) {
        # 和第 6 项同一个纪律：解析不出来就不能当作通过。
        # 一行都没匹配到还输出「检查通过」，是这份脚本一直在犯的错。
        Add-Problem $modelPath '《数据模型》的权限总表解析不出任何行，无法校验客户端写操作白名单（表格格式是否改了？）'
    }
} else {
    Add-Problem $modelPath '缺少《数据模型》文档，无法校验客户端写操作白名单'
}

if ($permRows.Count -gt 0) {
    $writeOps = @('add', 'update', 'set', 'remove')
    $clientWriteHits = @{}
    foreach ($f in $jsFiles) {
        $rel = Get-Rel $f
        if (-not $rel.StartsWith('miniprogram\')) { continue }
        $text = Remove-JsComments (Read-Text $f)
        $sites = [regex]::Matches($text, "collection\(\s*'([a-z][a-z0-9_]*)'")
        for ($i = 0; $i -lt $sites.Count; $i++) {
            $start = $sites[$i].Index
            $end = if ($i + 1 -lt $sites.Count) { $sites[$i + 1].Index } else { $text.Length }
            if ($end -le $start) { continue }
            $seg = $text.Substring($start, $end - $start)
            $coll = $sites[$i].Groups[1].Value
            foreach ($op in $writeOps) {
                if ($seg -match ('\.' + $op + '\s*\(')) {
                    if (-not $clientWriteHits.ContainsKey($coll)) {
                        $clientWriteHits[$coll] = @()
                    }
                    $clientWriteHits[$coll] += ('{0}({1})' -f $rel, $op)
                }
            }
        }
    }

    $violations = 0
    foreach ($coll in ($clientWriteHits.Keys | Sort-Object)) {
        $where = ($clientWriteHits[$coll] | Sort-Object -Unique) -join '、'
        if (-not $permRows.ContainsKey($coll)) {
            Add-Problem $modelPath ("客户端写了集合 {0}，但《数据模型》权限总表里没有它：{1}" -f $coll, $where)
            $violations++
        } elseif (-not $permRows[$coll]) {
            Add-Problem $modelPath ("客户端写了集合 {0}，但《数据模型》声明它「客户端可写」为否：{1}" -f $coll, $where)
            $violations++
        }
    }

    # 反向：声明可写却没人写，可能是权限配宽了，也可能是代码改过文档没跟上。
    # 这类偏差不报错，只提示——留着可写权限的风险由部署者判断。
    $declaredButUnused = @()
    foreach ($coll in ($permRows.Keys | Sort-Object)) {
        if ($permRows[$coll] -and -not $clientWriteHits.ContainsKey($coll)) {
            $declaredButUnused += $coll
        }
    }
    if ($declaredButUnused.Count -gt 0) {
        # 曾经在这里漏了 -f 的参数：格式串里没有 {0}，列表被整段丢弃，
        # 输出成一句「可能配宽了：」后面什么都没有。提示没了等于没提示。
        Add-Note ('以下集合声明「客户端可写」但代码里没有客户端写入，权限可能配宽了，请确认是否真需要：' + ($declaredButUnused -join '、'))
    }
    # 关键：违规时绝不能输出「检查通过」。
    # 这份脚本一直在犯的错就是「报告看着干净，实际一项都没查成」——
    # 早先 app.json 解析失败时会安静地一个页面都不检查却显示通过。
    # 同一个错在这里是：报了 2 个问题、同时又打印一句「全部与《数据模型》一致」。
    if ($violations -eq 0) {
        Add-Note ('客户端写操作白名单检查通过：{0} 个集合有客户端写入，全部与《数据模型》一致' -f $clientWriteHits.Count)
    }
}

# ---------------------------------------------------------------- 输出
$line = ([string][char]0x2500) * 64
Write-Output ''
Write-Output '项目自检'
Write-Output $line
Write-Output ("  扫描文件 {0} 个（文本 {1} 个 / JS {2} 个）" -f $allFiles.Count, $textFiles.Count, $jsFiles.Count)
Write-Output ("  页面 {0} 个 · 云函数 {1} 个 · 集合 {2} 个" -f $pageDirs.Count, $cfDirs.Count, $collectionList.Count)
Write-Output ''

foreach ($n in $notes) { Write-Output ("  [i] {0}" -f $n) }
if ($notes.Count) { Write-Output '' }

if ($problems.Count -eq 0) {
    Write-Output '  [OK] 全部检查通过'
    Write-Output $line
    Write-Output ''
    exit 0
}

$grouped = $problems | Group-Object File
foreach ($g in $grouped) {
    Write-Output ("  {0}" -f $g.Name)
    foreach ($p in $g.Group) { Write-Output ("      - {0}" -f $p.Message) }
}
Write-Output $line
Write-Output ("  发现 {0} 个问题，涉及 {1} 个文件" -f $problems.Count, $grouped.Count)
Write-Output ''

foreach ($p in $problems) { Write-Verbose ("{0}: {1}" -f $p.File, $p.Message) }
exit 1
