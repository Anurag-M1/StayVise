#!/bin/bash
set -e

# Configuration
BASE_URL=${BASE_URL:-"https://staging.stayvise.in/api/v1"}
RESULTS_DIR="results"

echo "=== StayVise Load Test Suite ==="
echo "Target: $BASE_URL"
echo "Results will be stored in: $RESULTS_DIR"

mkdir -p $RESULTS_DIR

run_test() {
  local test_file=$1
  local output_name=$2
  echo ""
  echo "------------------------------------------------------------"
  echo "--- Running: $test_file ---"
  echo "------------------------------------------------------------"
  k6 run --env BASE_URL=$BASE_URL $test_file --out json=$RESULTS_DIR/$output_name.json
  echo "--- Completed: $test_file ---"
}

# Run tests sequentially
run_test auth_load.js auth_results
run_test project_flow.js project_results
run_test webhook_load.js webhook_results

echo ""
echo "============================================================"
echo "=== All tests completed successfully ==="
echo "============================================================"
echo "Review $RESULTS_DIR/ directory for detailed JSON reports."
