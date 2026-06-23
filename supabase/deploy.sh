#!/usr/bin/env bash
# AiDecision — Deploy to Supabase
# Run this from the repo root on your local machine.
#
# Prerequisites:
#   brew install supabase/tap/supabase   # macOS
#   npm install -g supabase              # or via npm
#
# Usage:
#   chmod +x supabase/deploy.sh
#   ./supabase/deploy.sh

set -euo pipefail

PROJECT_REF="tbwjwtctdvssilsxlbod"
REGION="eu-central-1"

echo ""
echo "AiDecision — Supabase deployment"
echo "================================="
echo ""

# ── 1. Login ──────────────────────────────────────────────────────────────────
echo "Step 1/3: Logging in to Supabase..."
echo "(This will open your browser for a one-time auth)"
supabase login

# ── 2. Run migration ──────────────────────────────────────────────────────────
echo ""
echo "Step 2/3: Running database migration..."
supabase db push --project-ref "$PROJECT_REF"
echo "✓ Migration complete"

# ── 3. Deploy edge function ───────────────────────────────────────────────────
echo ""
echo "Step 3/3: Deploying ingest edge function..."
supabase functions deploy ingest \
  --project-ref "$PROJECT_REF" \
  --no-verify-jwt
echo "✓ Edge function deployed"

echo ""
echo "================================="
echo "Deployment complete."
echo ""
echo "Ingest endpoint:"
echo "  https://${PROJECT_REF}.supabase.co/functions/v1/ingest"
echo ""
echo "Update the Python SDK to use this endpoint:"
echo "  export AIDECISION_API_KEY=<your-key>"
echo ""
echo "Test it:"
echo "  curl -X POST https://${PROJECT_REF}.supabase.co/functions/v1/ingest \\"
echo "    -H 'Authorization: Bearer \$AIDECISION_API_KEY' \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"events\":[]}'"
