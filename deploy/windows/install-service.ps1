param([string]$ServiceName='AuthCodePlatform',[int]$Port=8080,[string]$AdminUser='admin',[Parameter(Mandatory=$true)][string]$AdminPassword,[Parameter(Mandatory=$true)][string]$OperationPassword)
$exe=(Resolve-Path (Join-Path $PSScriptRoot '..\..\AuthCodePlatform.exe')).Path
$binPath='"'+$exe+'" --port '+$Port+' --admin-user "'+$AdminUser+'" --admin-password "'+$AdminPassword+'" --operation-password "'+$OperationPassword+'"'
sc.exe create $ServiceName binPath= $binPath start= auto DisplayName= '授权码分发平台'
sc.exe start $ServiceName
