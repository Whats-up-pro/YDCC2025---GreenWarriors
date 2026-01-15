# n8n Setup Guide

This guide provides step-by-step instructions for setting up and configuring n8n workflow automation for the Shrimp Disease Detection System.

## Overview

n8n is used as an orchestration layer to handle background tasks such as:
- Saving detection logs to the database
- Sending notifications when diseases are detected
- Running rule engines (e.g., alert when confidence is high and label is WSD)
- Integrating with external services (SMS, Email, etc.)

## Prerequisites

- Docker and Docker Compose installed
- Access to the PostgreSQL database
- Basic understanding of workflow automation

## Installation

### Option 1: Using Docker Compose (Recommended)

The n8n service is already configured in `deployments/docker-compose.yml`. To start it:

```bash
cd deployments
docker-compose up -d n8n
```

n8n will be available at: `http://localhost:5678`

### Option 2: Standalone Installation

If you prefer to run n8n standalone:

```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

## Initial Setup

### 1. Access n8n UI

1. Open your browser and navigate to `http://localhost:5678`
2. On first launch, you'll be prompted to create an admin account
3. Fill in your credentials:
   - Email: Your email address
   - Password: Strong password (minimum 8 characters)
   - First Name: Your first name
   - Last Name: Your last name

### 2. Configure Environment Variables

Ensure the following environment variables are set in your `.env` file:

```env
# n8n Configuration
N8N_WEBHOOK_URL=http://n8n:5678/webhook
N8N_TIMEOUT=5
N8N_MAX_RETRIES=3
N8N_RETRY_DELAY=1.0
```

**Note**: When running in Docker, use `http://n8n:5678` (service name) instead of `localhost`.

## Creating Workflows

### Detection Notification Workflow

This workflow receives webhooks from the backend when a disease is detected and processes the data.

#### Step 1: Create New Workflow

1. Click "Workflows" in the left sidebar
2. Click "New Workflow"
3. Name it: `detect_notification`

#### Step 2: Add Webhook Trigger

1. Click "Add Node" or press `+`
2. Search for "Webhook"
3. Select "Webhook" node
4. Configure the webhook:
   - **HTTP Method**: POST
   - **Path**: `/detect_notification`
   - **Response Mode**: "Respond to Webhook"
   - **Response Code**: 200
5. Click "Execute Node" to get the webhook URL
6. Copy the webhook URL (format: `http://localhost:5678/webhook/detect_notification`)

#### Step 3: Add Code Node (Optional - Data Transformation)

1. Add a "Code" node after the Webhook node
2. Select "Run once for all items"
3. Add the following JavaScript code:

```javascript
// Transform detection data
const items = $input.all();
return items.map(item => {
  const data = item.json;
  return {
    json: {
      label: data.label,
      confidence: data.confidence,
      processing_time: data.processing_time,
      timestamp: new Date().toISOString(),
      isWSD: data.label === 'WSD',
      isHighConfidence: data.confidence >= 0.9
    }
  };
});
```

#### Step 4: Add IF Node (Rule Engine)

1. Add an "IF" node after the Code node
2. Configure conditions:
   - **Condition**: "Boolean"
   - **Value 1**: `{{ $json.isWSD }}`
   - **Operation**: AND
   - **Value 2**: `{{ $json.isHighConfidence }}`
3. This will split the workflow:
   - **True branch**: High confidence WSD detection → Send alert
   - **False branch**: Normal detection → Just log

#### Step 5: Add PostgreSQL Node (Save to Database)

1. Add a "PostgreSQL" node
2. Configure database connection:
   - **Host**: `db` (or `localhost` if running outside Docker)
   - **Port**: `5432`
   - **Database**: `shrimp_db`
   - **User**: `postgres`
   - **Password**: Your database password
3. Select operation: **Insert**
4. Configure table: `detection_logs`
5. Map columns:
   ```json
   {
     "prediction_label": "={{ $json.label }}",
     "confidence": "={{ $json.confidence }}",
     "created_at": "={{ $json.timestamp }}"
   }
   ```
6. Place this node in the **False branch** (for all detections)

#### Step 6: Add HTTP Request Node (Notifications - Optional)

For sending notifications (SMS, Email, etc.):

1. Add an "HTTP Request" node in the **True branch**
2. Configure:
   - **Method**: POST
   - **URL**: Your notification service endpoint
   - **Body**: JSON with detection data
3. Example body:
   ```json
   {
     "message": "WSD detected with {{ $json.confidence }}% confidence",
     "priority": "high"
   }
   ```

#### Step 7: Activate Workflow

1. Click "Save" to save the workflow
2. Toggle the "Active" switch (top right) to activate the workflow
3. The workflow will now listen for webhooks

## Exporting Workflows

To export workflows for version control:

1. Click on the workflow name
2. Click the three dots menu (⋯)
3. Select "Download"
4. Save the JSON file to `n8n/workflows/detect_notification.json`

## Testing Workflows

### Test Webhook Manually

You can test the webhook using curl:

```bash
curl -X POST http://localhost:5678/webhook/detect_notification \
  -H "Content-Type: application/json" \
  -d '{
    "label": "WSD",
    "confidence": 0.95,
    "processing_time": 0.123
  }'
```

### Test from Backend

The backend will automatically call the webhook when:
- A detection is made
- Confidence >= threshold (default: 0.7)
- The detection is processed

Check n8n execution logs to verify:
1. Go to "Executions" in the left sidebar
2. View recent executions
3. Check for any errors

## Troubleshooting

### Webhook Not Receiving Requests

1. **Check workflow is active**: Toggle must be ON (green)
2. **Verify webhook URL**: Check the webhook URL matches your configuration
3. **Check network**: Ensure backend can reach n8n (use service name in Docker)
4. **Check logs**: View n8n logs: `docker-compose logs n8n`

### Database Connection Issues

1. **Verify credentials**: Check database credentials in n8n node
2. **Network connectivity**: Ensure n8n can reach PostgreSQL
3. **Test connection**: Use "Test Connection" button in PostgreSQL node

### Workflow Execution Errors

1. **Check execution logs**: Go to "Executions" → Select failed execution
2. **Verify data format**: Ensure data matches expected schema
3. **Check node configuration**: Verify all node settings are correct

## Best Practices

1. **Version Control**: Export workflows regularly to `n8n/workflows/`
2. **Error Handling**: Add error handling nodes for critical workflows
3. **Logging**: Use Code nodes to add custom logging
4. **Testing**: Test workflows with sample data before activating
5. **Monitoring**: Regularly check execution logs for errors
6. **Security**: Keep n8n credentials secure, use environment variables

## Advanced Configuration

### Custom Webhook Authentication

If you need to secure webhooks:

1. In Webhook node settings, enable "Authentication"
2. Choose authentication method (Basic Auth, Header Auth, etc.)
3. Update backend `n8n_client.py` to include authentication headers

### Scheduled Workflows

To create scheduled workflows (e.g., daily reports):

1. Use "Cron" node instead of Webhook
2. Configure schedule (e.g., `0 0 * * *` for daily at midnight)
3. Connect to your processing nodes

## Integration with Backend

The backend automatically calls n8n webhooks via `N8NClient` service:

- **Service**: `backend/app/services/n8n_client.py`
- **Method**: `log_detection(detection_data)`
- **Webhook URL**: Configured in `.env` as `N8N_WEBHOOK_URL`
- **Retry Logic**: Automatic retry with exponential backoff (3 attempts)

## Next Steps

After setting up n8n:

1. Create and activate the `detect_notification` workflow
2. Test the webhook with sample data
3. Verify database logs are being saved
4. Configure notification services if needed
5. Export workflows to `n8n/workflows/` for version control

## References

- [n8n Documentation](https://docs.n8n.io/)
- [n8n Workflow Examples](https://n8n.io/workflows/)
- [Webhook Node Documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
