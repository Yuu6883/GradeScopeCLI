# GradeScopeCLI
CLI for GradeScope.com (A site used for submitting and grading homework)
![](https://i.imgur.com/9nSiQrO.gif)

# Installation
```
git clone https://github.com/Yuu6883/GradeScopeCLI.git
npm i
```
npm package coming soon... (possibly `npm i -g gradescope-cli`)

# Security
### This package doesn't use any virtual browser library and all networking is done with built-in https module. 
### The package **doesn't** store your credentials anywhere (only used when exchanging for access token), but it **does** store your access token to gradescope locally (package_dir/token.txt) **only if you choose "Remember Me"** option when login.

# Todo
* ~~Log In and Out (handle session & cookies)~~
* ~~View courses and homework~~
* Submit files through CLI file system browsing
* Notification system (new homework/grades posted)
