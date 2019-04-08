// Library to send signal to Q keyboards
const q = require('daskeyboard-applet');
// Library to send request to API
const request = require('request-promise');
// Library to convert to Base64
const btoa = require('btoa');

const logger = q.logger;

const baseUrl1 = 'https://';
const baseUrl2 = '.mydonedone.com/issuetracker/api/v2'

// Get the current time
function getTime() {
  var now =  new Date().getTime()/1000;
  var nowWithoutDot = `${now}`.replace('.','');
  return nowWithoutDot;
}

// Test if an object is empty
function isEmpty(obj) {
  for(var key in obj) {
      if(obj.hasOwnProperty(key))
          return false;
  }
  return true;
}


class DoneDone extends q.DesktopApp {

  constructor() {
    super();
    // run every 20 sec
    this.pollingInterval = 20 * 1000;
  }

  async applyConfig() {

    logger.info("DoneDone initialisation.")

    this.subdomain = this.config.subdomain;
    this.username = this.config.username;
    
    if(this.subdomain){

      // Create and initialize time variable
      this.now = getTime();

      this.baseUrl = baseUrl1 + this.subdomain + baseUrl2;
      this.params = `${this.config.username}:${this.authorization.apiKey}`;
      this.paramsBase64Encoded = btoa(this.params);
    
      this.serviceHeaders = {
        "Authorization": `Basic ${this.paramsBase64Encoded}`,
      }

      // Get the user ID
      await request.get({
        url: `${this.baseUrl}/people/me.json`,
        headers: this.serviceHeaders,
        json: true
      }).then((body) => {
        this.userId = body.id;
        logger.info("Got DoneDone userID: "+ this.userId);
      })
      .catch(error => {
        logger.error(
          `Got error sending request to service: ${JSON.stringify(error)}`);
      });

      if(this.config.option == "created"){
        logger.info("Need to initialize number of issue.")
        await request.get({
          url: `${this.baseUrl}/issues/all.json`,
          headers: this.serviceHeaders,
          json: true
        }).then((body) => {
          this.issuesNumber = body.total_issues;
          logger.info(`Initialize with ${this.issuesNumber} issues number.`);
        });
      }

      if(this.config.option == "closed"){
        logger.info("Need to initialize the state of the issues.")
        // Array to keep in mind the issues state.
        this.status = {};
        await request.get({
          url: `${this.baseUrl}/issues/all.json`,
          headers: this.serviceHeaders,
          json: true
        }).then((body) => {
          for (let issue of body.issues) {
            this.status[issue.title] = issue.status.name;
          }
          logger.info("This is the initialized array of issues status: "+JSON.stringify(this.status));
        });
      }

    }else{
      logger.info("Subdomain is undefined. Configuration is not done yet");
    }

  }

  // call this function every pollingInterval
  async run() {
    let signal = null;
    let triggered = false;
    let message = [];
    let url;

    try {
      const body = await request.get({
        url: `${this.baseUrl}/issues/all.json`,
        headers: this.serviceHeaders,
        json: true
      });

      logger.info("DoneDone running.");

      // Test if there is something inside the response
      var isBodyEmpty = isEmpty(body) || (body === "[]");
      if (isBodyEmpty) {
        logger.info("Response empty when getting all issues.");
      }
      else {

        switch(this.config.option){
          case "created":
            logger.info("CREATED OPTION");
            if(body.total_issues>this.issuesNumber){
              logger.info("CREATED ISSUE");

              // Need to send a signal
              triggered = true;
              // Test if there is several issues
              if(body.total_issues-1>this.issuesNumber){
                // Several created issues here

                // Update signal's message
                message.push(`Issues created.`);
                url = `https://${this.subdomain}.mydonedone.com/issuetracker`;
              }else{
                // Only one created issue here
                
                // Update signal's message
                message.push(`${body.issues[0].title} issue created. Check ${body.issues[0].project.name} project.`);
                url = `https://${this.subdomain}.mydonedone.com/issuetracker/projects/${body.issues[0].project.id}/issues/${body.issues[0].order_number}`;
              }
            }
            // Updated number of issues (if issue is deleted)
            this.issuesNumber = body.total_issues;

            break;
          case "closed":
            logger.info("CLOSED OPTION");
            // Extract the issues from the response
            for (let issue of body.issues) {
              // Check previous status with new status
              logger.info("Previous status: "+this.status[issue.title]);
              logger.info("Current status: "+issue.status.name);

              if((this.status[issue.title] != "Closed" ) && ( issue.status.name == "Closed")){
                logger.info("CLOSEEEEDDD ISSUEEEEE");
                message.push(`${issue.title} issue closed. Check ${issue.project.name} project.`);
                // Check if a signal is already set up
                // in order to change the url
                if(triggered){
                  url = `https://${this.subdomain}.mydonedone.com/issuetracker`;
                }else{
                  url = `https://${this.subdomain}.mydonedone.com/issuetracker/projects/${issue.project.id}/issues/${issue.order_number}`;
                }
                // Need to send a signal
                triggered = true;
              }
              // Updated previous status
              this.status[issue.title]=issue.status.name;
            }
            break;
          case "updated":
            logger.info("UPDATED OPTION");
            // Extract the issues from the response
            for (let issue of body.issues) {
              // If there is an update on a issue AND the user is not the updater.
              if( (issue.last_updated_on.slice(6,18) > this.now) && (issue.last_updater.id != this.userId) ){
                logger.info("UPDATED ISSUEEEEE");

                // Update signal's message
                message.push(`${issue.title} issue updated. Check ${issue.project.name} project.`);
                // Check if a signal is already set up
                // in order to change the url
                if(triggered){
                  url = `https://${this.subdomain}.mydonedone.com/issuetracker`;
                }else{
                  url = `https://${this.subdomain}.mydonedone.com/issuetracker/projects/${issue.project.id}/issues/${issue.order_number}`;
                }
                // Need to send a signal
                triggered = true;
              }
            }
            break;
          default:
            logger.error("Config issue.")
        }
        
        // If we need to send a signal with one or several updates.
        if(triggered){

          // Updated time
          this.now = getTime();

          // Create signal
          signal = new q.Signal({
            points: [[new q.Point(this.config.color, this.config.effect)]],
            name: "DoneDone",
            message: message.join("<br>"),
            link: {
              url: url,
              label: 'Show in DoneDone',
            }
          });

        }

        return signal;
      }
    }
    catch (error) {
      logger.error(`Got error sending request to service: ${JSON.stringify(error)}`);
      return q.Signal.error([
        'The DoneDone service returned an error. Please check your API key and account.',
        `Detail: ${error.message}`
      ]);
    }

  }

}

module.exports = {
  DoneDone: DoneDone,
};

const doneDone = new DoneDone();