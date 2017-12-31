#!/bin/bash
set -e

STACK_NAME=${1:?Usage: undeploy.sh <stack_name> <aws_region>}
AWS_REGION=${2:?Usage: undeploy.sh <stack_name> <aws_region>}

echo Deleting stack
aws cloudformation delete-stack --region ${AWS_REGION} --stack-name ${STACK_NAME}

echo Waiting for stack to be deleted
while aws cloudformation describe-stacks --region ${AWS_REGION} --stack-name ${STACK_NAME} >/dev/null 2>&1;
  do sleep 3;
done
