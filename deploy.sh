#!/bin/bash
set -e

# Before runing this script, open the IoT console to create an endpoint for your account.

STACK_NAME=${1:?Usage: deploy.sh <stack_name> <aws_region> <s3_bucket>}
AWS_REGION=${2:?Usage: deploy.sh <stack_name> <aws_region> <s3_bucket>}
S3_BUCKET=${3:?Usage: deploy.sh <stack_name> <aws_region> <s3_bucket>}

mkdir -p tmp

echo Fetching IoT endpoint URL
AWS_IOT_ENDPOINT=`aws iot describe-endpoint --region eu-west-1 | perl -lne 'print $1 if /"endpointAddress": "([^"]+)"/'`

echo Checking S3 bucket
if ! aws s3 ls s3://${S3_BUCKET} >/dev/null; then
  echo Creating S3 bucket to host CloudFormation config files
  aws s3 mb s3://${S3_BUCKET} --region ${AWS_REGION}
fi

# Zips up the current directory, writes the zip file to S3, adds a
# CodeUri property for any lambdas with the S3 path to the zip file
# (the template file on S3 does not contain the CodeUri)
echo Packaging CloudFormation template
aws cloudformation package \
   --template-file cloudformation/template.yaml \
   --output-template-file tmp/app.yaml \
   --s3-bucket ${S3_BUCKET} >/dev/null

echo Creating CloudFormation stack
aws cloudformation deploy \
   --region ${AWS_REGION} \
   --template-file tmp/app.yaml \
   --stack-name ${STACK_NAME} \
   --capabilities CAPABILITY_IAM \
   --parameter-overrides AwsIoTEndpoint=${AWS_IOT_ENDPOINT}

echo Fetching identity pool id
AWS_IDENTITY_POOL_ID=`aws cloudformation describe-stacks --region ${AWS_REGION} --stack-name ${STACK_NAME} | grep -A 1 '"OutputKey": "IdentityPoolId"' | perl -lne 'print $1 if /"OutputValue": "([^"]+)"/'`

echo Patching AWS settings into index.js
sed -e "s/<AWS_REGION>/${AWS_REGION}/g" \
    -e "s/<AWS_IDENTITY_POOL_ID>/${AWS_IDENTITY_POOL_ID}/g" \
    -e "s/<AWS_IOT_ENDPOINT>/${AWS_IOT_ENDPOINT}/g" \
    < www/index.js > tmp/index.js

echo Uploading static website files
aws s3 cp tmp/index.js s3://${S3_BUCKET} --region ${AWS_REGION} --acl public-read-write
aws s3 cp www/index.html s3://${S3_BUCKET} --region ${AWS_REGION} --acl public-read-write
# Setting the error document to index.html is a hack to make <url>/myroom load the chat application.
aws s3 website s3://${S3_BUCKET} --region ${AWS_REGION} --index-document index.html --error-document index.html

echo Visit http://${S3_BUCKET}.s3-website-${AWS_REGION}.amazonaws.com
