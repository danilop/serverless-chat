#!/bin/bash
set -e

# Before runing this script, open the IoT console to create an endpoint for your account.

STACK_NAME=${1:?Usage: deploy.sh <stack_name> <aws_region> <s3_bucket>}
AWS_REGION=${2:?Usage: deploy.sh <stack_name> <aws_region> <s3_bucket>}
S3_BUCKET=${3:?Usage: deploy.sh <stack_name> <aws_region> <s3_bucket>}

mkdir -p tmp

echo Checking S3 bucket
if ! aws s3 ls s3://${S3_BUCKET} >/dev/null; then
  echo Error - bucket ${S3_BUCKET} does not exist
  exit
fi

echo Fetching identity pool id
AWS_IDENTITY_POOL_ID=`aws cloudformation describe-stacks --region ${AWS_REGION} --stack-name ${STACK_NAME} | grep -A 1 '"OutputKey": "IdentityPoolId"' | perl -lne 'print $1 if /"OutputValue": "([^"]+)"/'`

echo Fetching IoT endpoint URL
AWS_IOT_ENDPOINT=`aws iot describe-endpoint --region eu-west-1 | perl -lne 'print $1 if /"endpointAddress": "([^"]+)"/'`

echo Patching AWS settings into index.js
sed -e "s/<AWS_REGION>/${AWS_REGION}/g" \
    -e "s/<AWS_IDENTITY_POOL_ID>/${AWS_IDENTITY_POOL_ID}/g" \
    -e "s/<AWS_IOT_ENDPOINT>/${AWS_IOT_ENDPOINT}/g" \
    < www/index.js > tmp/index.js

echo Uploading static website files
aws s3 cp tmp/index.js s3://${S3_BUCKET} --region ${AWS_REGION} --acl public-read-write
aws s3 cp www/index.html s3://${S3_BUCKET} --region ${AWS_REGION} --acl public-read-write
aws s3 cp www/custom.css s3://${S3_BUCKET} --region ${AWS_REGION} --acl public-read-write
# Setting the error document to index.html is a hack to make <url>/myroom load the chat application.
aws s3 website s3://${S3_BUCKET} --region ${AWS_REGION} --index-document index.html --error-document index.html

echo Visit http://${S3_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com

rm tmp/*
