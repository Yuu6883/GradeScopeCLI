# Project Discontinued
I don't have time to work on this and I don't really see a point why you would turn in your homework from commandline (maybe for some CS classes it can be useful). The actual useful function to be implemented is permutation guessing on unlimited tries quizzes, but I doubt anyone would bother to make it from commandline when they are smart enough (unlike me) to do their gradescope quizzes in the legit way.

# GradeScopeCLI
CLI for GradeScope.com (A site used for submitting and grading Assignment)
![](https://github.com/Yuu6883/GradeScopeCLI/blob/master/img/start.PNG?raw=true)

# Demo
![](https://media.giphy.com/media/S5JphkJuibU79UPhTR/giphy.gif)

# Installation
```
npm install -g gradescope-cli
```

# Usage
```
gradescope
```

# Security
#### This package doesn't use any virtual browser library and all networking is done with built-in https module. 
#### The package **doesn't** store your credentials anywhere (only used when exchanging for access token), but it **does** store your access token to gradescope locally (package_dir/token.txt) **only if you choose "Remember Me"** option when login.

# Todo
* ~~Log In and Out (handle session & cookies)~~
* ~~View courses and Assignment~~
* Submit files through CLI file system browsing
* Notification system (new Assignment/grades posted)
