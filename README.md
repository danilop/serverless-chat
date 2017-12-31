# Serverless Chat

A serverless web chat built using AWS Lambda, AWS IoT (for WebSockets) and Amazon DynamoDB.

The architecture of this application is described in this article:

- [Serverless beyond Functions](https://medium.com/danilop/serverless-beyond-functions-cd81ee4c6b8d)

## Deploying to AWS

A script is provided, `deploy.sh` which uses AWS CloudFormation to provision all the resources needed for this demo. To use it:

- Create an AWS account.
- Visit the [IoT management page](https://console.aws.amazon.com/iot/home) in the AWS web console and ensure that an IoT endpoint has been provisioned for your account.
- Install the [AWS command line tools](https://aws.amazon.com/cli/) and set up your credentials.
- Run the `deploy.sh` script, specifying a name for your new CloudFormation stack, an AWS region and the name of an S3 bucket where the CloudFormation config files will be stored. The S3 bucket will be created if it does not exist.

  ./deploy.sh LambdaChatStack us-west-1 my.s3.bucket.name

Once the AWS resources have been provisioned, the script will print a URL to visit in your browser to see the demo.

NB: The Kinesis functionality has been disabled because it is billed per shard-hour. To enable it, edit `cloudformation/template.yaml` and uncomment the relevant lines before running `deploy.sh`.
