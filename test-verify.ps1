# Test verify-upload endpoint
$base = "http://localhost:4000"

# 1. Login as admin
$loginBody = @{email="admin@wallet.local";password="admin123"} | ConvertTo-Json
$loginResp = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
$token = $loginResp.token
Write-Host "Logged in as admin"

# 2. Get pending uploads
$headers = @{Authorization = "Bearer $token"}
$uploads = Invoke-RestMethod -Uri "$base/credentials/pending-uploads" -Headers $headers
Write-Host "Pending uploads: $($uploads.uploads.Count)"

if ($uploads.uploads.Count -eq 0) {
    Write-Host "No pending uploads to verify"
    exit
}

$uploadId = $uploads.uploads[0].id
Write-Host "Will verify upload: $uploadId"

# 3. Verify the upload
$verifyBody = @{
    achievementName = "Cloud Computing Certificate"
    issuerName = "Amazon Web Services"
    achievementDescription = "AWS Cloud Practitioner certification"
    criteria = "Pass the AWS exam with 70% or higher"
    notes = "Verified via test script"
} | ConvertTo-Json

try {
    $verifyResp = Invoke-RestMethod -Uri "$base/credentials/verify-upload/$uploadId" -Method POST -Body $verifyBody -Headers $headers -ContentType "application/json"
    Write-Host "SUCCESS: $($verifyResp.message)"
    Write-Host "Credential ID: $($verifyResp.credentialId)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    $_.ErrorDetails.Message
}
