Remove-Item -Recurse -Force src/core/rag -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force src/core/mcp -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force src/core/diff -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force src/core/file-search -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force src/core/transformations -ErrorAction SilentlyContinue
Remove-Item -Force src/components/chat-view/InsightView.tsx -ErrorAction SilentlyContinue
Remove-Item -Force src/components/chat-view/McpHubView.tsx -ErrorAction SilentlyContinue
Remove-Item -Force src/components/chat-view/SearchView.tsx -ErrorAction SilentlyContinue
Remove-Item -Force src/components/chat-view/CustomModeView.tsx -ErrorAction SilentlyContinue
Remove-Item -Force src/components/chat-view/contexts/DataviewContext.tsx -ErrorAction SilentlyContinue
Remove-Item -Force src/components/chat-view/contexts/DiffStrategyContext.tsx -ErrorAction SilentlyContinue
Remove-Item -Force src/components/chat-view/contexts/McpHubContext.tsx -ErrorAction SilentlyContinue
Remove-Item -Force src/components/chat-view/contexts/RAGContext.tsx -ErrorAction SilentlyContinue
Remove-Item -Force src/components/chat-view/contexts/TransContext.tsx -ErrorAction SilentlyContinue
Write-Host "Cleanup complete."
