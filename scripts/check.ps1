<#
.SYNOPSIS
    项目自检 —— 零依赖，Windows PowerShell 5.1 与 PowerShell 7 均可运行。

.DESCRIPTION
    本地运行：
        powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check.ps1
        或
        pwsh -NoProfile -File scripts/check.ps1

    CI 中由 .github/workflows/ci.yml 通过 shell: pwsh 调用。

    检查项：
        1. JSON 合法性
        2. 编码（UTF-8 无 BOM）
        3. 换行符（仓库内统一 LF）
        4. 文件末尾换行 + 无行尾空格
        5. 密钥泄露
        6. 页面四件套完整性 + app.json 注册一致
        7. 静态资源引用存在性
        8. 配色合规（严禁蓝紫色 —— 产品硬性约束）
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$Root = Split-Path -Parent $PSScriptRoot
$problems = New-Object System.Collections.ArrayList
$notes = New-Object System.Collections.ArrayList

function Add-Problem {
    param([string]$File, [string]$Message)
    [void]$problems.Add([pscustomobject]@{ File = $File; Message = $Message })
}
function Add-Note { param([string]$Text) [void]$notes.Add($Text) }
function Get-Rel { param([string]$Path) return $Path.Substring($Root.Length + 1) }

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

foreach ($f in $textFiles) {
    $r = Get-Rel $f
    # project.private.config.json 已被 .gitignore 排除，不纳入检查
    if ($r -eq 'project.private.config.json') { continue }
    $ext = Get-Ext $f
    $bytes = [System.IO.File]::ReadAllBytes($f)

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

    # 4. 末尾换行 + 行尾空格
    if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { Add-Problem $f '文件末尾缺少换行' }
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
Add-Type -AssemblyName System.Web.Extensions
$json = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$json.MaxJsonLength = 10485760

$appJson = $null
$appJsonPath = Join-Path $Root 'miniprogram\app.json'

foreach ($f in ($allFiles | Where-Object { $_.ToLower().EndsWith('.json') })) {
    $text = [System.IO.File]::ReadAllText($f, [System.Text.UTF8Encoding]::new($false))
    try { $parsed = $json.DeserializeObject($text) }
    catch { Add-Problem $f ('JSON 解析失败：' + $_.Exception.Message); continue }
    if ($f -eq $appJsonPath) { $appJson = $parsed }
}

# ---------------------------------------------------------------- 6. 页面完整性
if ($null -ne $appJson) {
    $mpRoot = Join-Path $Root 'miniprogram'
    $registered = @()
    foreach ($page in $appJson['pages']) {
        $registered += $page
        foreach ($e in @('.js', '.json', '.wxml', '.wxss')) {
            $p = Join-Path $mpRoot ($page + $e)
            if (-not (Test-Path -LiteralPath $p)) { Add-Problem $p ("页面 {0} 缺少 {1} 文件" -f $page, $e) }
        }
    }

    $pagesDir = Join-Path $mpRoot 'pages'
    if (Test-Path -LiteralPath $pagesDir) {
        foreach ($d in (Get-ChildItem -LiteralPath $pagesDir -Directory)) {
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
    $text = [System.IO.File]::ReadAllText($f, [System.Text.UTF8Encoding]::new($false))
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

# ---------------------------------------------------------------- 8. 配色合规
# 蓝紫色相区间 200°~320°。本项目明令禁止。
function Get-Hue {
    param([string]$Hex)
    $r = [Convert]::ToInt32($Hex.Substring(1, 2), 16) / 255.0
    $g = [Convert]::ToInt32($Hex.Substring(3, 2), 16) / 255.0
    $b = [Convert]::ToInt32($Hex.Substring(5, 2), 16) / 255.0
    $max = [Math]::Max($r, [Math]::Max($g, $b))
    $min = [Math]::Min($r, [Math]::Min($g, $b))
    $d = $max - $min
    if ($d -eq 0) { return $null }
    if ($max -eq $r)      { $h = 60 * ((($g - $b) / $d) % 6) }
    elseif ($max -eq $g)  { $h = 60 * (($b - $r) / $d + 2) }
    else                 { $h = 60 * (($r - $g) / $d + 4) }
    return ($h + 360) % 360
}

$blueViolet = 0
foreach ($f in ($textFiles | Where-Object { ($_.ToLower() -match '\.(wxss|wxml|json)$') })) {
    $text = [System.IO.File]::ReadAllText($f, [System.Text.UTF8Encoding]::new($false))
    foreach ($m in [regex]::Matches($text, '#([0-9a-fA-F]{6})\b')) {
        $hue = Get-Hue $m.Value
        if ($null -eq $hue) { continue }
        if ($hue -ge 200 -and $hue -le 320) {
            Add-Problem $f ("违反配色约束：{0} 属蓝紫色相（{1}°）—— 见 docs/设计规范.md" -f $m.Value, [Math]::Round($hue))
            $blueViolet++
        }
    }
}
if ($blueViolet -eq 0) { Add-Note '配色检查通过：未发现蓝紫色' }

# ---------------------------------------------------------------- 输出
$line = ([string][char]0x2500) * 64
Write-Output ''
Write-Output '项目自检'
Write-Output $line
Write-Output ("  扫描文件 {0} 个（文本 {1} 个）" -f $allFiles.Count, $textFiles.Count)
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
